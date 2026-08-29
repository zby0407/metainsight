# -*- coding: utf-8 -*-
"""Portfolio review service: period attribution with exact reconciliation.

Decomposes the period equity change into per-symbol contributions using the
identity:

    contribution(s) = MV_end(s) - MV_start(s)
                      + sells(s) - buys(s) - fees(s) - tax(s)

The residual between the sum of contributions and (equity change - net cash
flow) is surfaced as an explicit "unattributed" bucket plus a reconciliation
gap when it exceeds tolerance. Nothing here is estimated by a model.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from src.config import Config, get_config
from src.repositories.portfolio_repo import PortfolioRepository
from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_risk_service import PortfolioRiskService
from src.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

MAX_PERIOD_DAYS = 400
MAX_FACT_SYMBOLS = 12
QUERY_PAGE_SIZE = 500


class PortfolioReviewService:
    """Compute period performance attribution as an evidence pack."""

    def __init__(
        self,
        *,
        repo: Optional[PortfolioRepository] = None,
        portfolio_service: Optional[PortfolioService] = None,
        risk_service: Optional[PortfolioRiskService] = None,
        config: Optional[Config] = None,
    ):
        self.repo = repo or PortfolioRepository()
        self.portfolio_service = portfolio_service or PortfolioService(repo=self.repo)
        self.config = config or get_config()
        self.risk_service = risk_service or PortfolioRiskService(
            repo=self.repo,
            portfolio_service=self.portfolio_service,
            config=self.config,
        )

    def get_review(
        self,
        *,
        account_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        today = date.today()
        end = end_date or today
        start = start_date or (end - timedelta(days=30))
        if start > end:
            raise ValueError("start_date must not be after end_date")
        if (end - start).days > MAX_PERIOD_DAYS:
            raise ValueError(f"Review period must not exceed {MAX_PERIOD_DAYS} days")
        if end > today:
            end = today

        account_id, account, base_currency = self._resolve_account(account_id)

        start_snapshot = self._account_snapshot(account_id, start - timedelta(days=1), cost_method)
        end_snapshot = self._account_snapshot(account_id, end, cost_method)
        if end_snapshot is None:
            raise ValueError("No snapshot available at period end")

        equity_start = float(start_snapshot["total_equity"]) if start_snapshot else 0.0
        equity_end = float(end_snapshot["total_equity"])
        positions_start = {p["symbol"]: p for p in (start_snapshot or {}).get("positions", [])}
        positions_end = {p["symbol"]: p for p in end_snapshot.get("positions", [])}

        trades = self._query_all_trades(account_id, start, end)
        cash_entries, mixed_currency = self._query_cash_flow(account_id, start, end, base_currency)
        net_cash_flow = sum(
            entry["amount"] if entry["direction"] == "in" else -entry["amount"]
            for entry in cash_entries
        )

        trade_stats = self._aggregate_trades(trades, base_currency)
        contribution_items, price_gaps = self._attribute(
            positions_start=positions_start,
            positions_end=positions_end,
            trade_stats=trade_stats,
        )

        expected_total = equity_end - equity_start - net_cash_flow
        parts_total = sum(item["contribution"] for item in contribution_items)
        residual = expected_total - parts_total
        tolerance = max(1.0, abs(equity_end) * 0.001)
        reconciled = abs(residual) <= tolerance

        builder = EvidencePackBuilder(
            pack_type="review",
            account_id=account_id,
            as_of=end,
        )
        self._declare_inputs(
            builder,
            account_name=account.name if account else "",
            start=start,
            end=end,
            trade_count=len(trades),
            cash_entry_count=len(cash_entries),
            mixed_currency=mixed_currency,
            price_gaps=price_gaps,
        )
        self._declare_methods(builder)

        fact_start = builder.add_fact("期初净值", round(equity_start, 2), unit="元", precision=2)
        fact_end = builder.add_fact("期末净值", round(equity_end, 2), unit="元", precision=2)
        builder.add_fact("净出入金", round(net_cash_flow, 2), unit="元", precision=2)
        fact_return = None
        if equity_start > 0:
            period_return = (equity_end - equity_start - net_cash_flow) / equity_start * 100.0
            fact_return = builder.add_fact(
                "期间收益率（扣除出入金）",
                round(period_return, 4),
                unit="%",
                precision=4,
                source_fact_ids=[fact_start, fact_end],
            )
        builder.add_fact("期间交易笔数", len(trades))

        ordered = sorted(contribution_items, key=lambda item: abs(item["contribution"]), reverse=True)
        fact_by_symbol: Dict[str, str] = {}
        for item in ordered[:MAX_FACT_SYMBOLS]:
            fact_by_symbol[item["symbol"]] = builder.add_fact(
                f"{item['symbol']} 收益贡献",
                round(item["contribution"], 2),
                unit="元",
                precision=2,
            )
        if len(ordered) > MAX_FACT_SYMBOLS:
            builder.add_gap(
                "info",
                f"共 {len(ordered)} 个标的参与归因，仅贡献绝对值前 {MAX_FACT_SYMBOLS} 名登记为可引用事实",
            )
        if residual > tolerance or residual < -tolerance:
            builder.add_gap(
                "warning",
                f"存在未归因金额 {residual:.2f} 元（可能来自分红、拆股、汇率折算或价格缺口），超过容差 {tolerance:.2f}",
                affected_fact_ids=[fact_start, fact_end],
            )

        for item in contribution_items:
            if item["symbol"] in fact_by_symbol:
                item["fact_id"] = fact_by_symbol[item["symbol"]]

        self._add_risk_rules(builder, account_id=account_id, as_of=end, cost_method=cost_method)

        cash_weight_start = self._cash_weight(start_snapshot)
        cash_weight_end = self._cash_weight(end_snapshot)
        if cash_weight_start is not None and cash_weight_end is not None:
            builder.add_fact(
                "现金占比（期初→期末）",
                f"{cash_weight_start:.1%} → {cash_weight_end:.1%}",
            )

        attribution_payload = [
            {
                "symbol": item["symbol"],
                "name": "",
                "market": item["market"],
                "quantity_start": item["quantity_start"],
                "quantity_end": item["quantity_end"],
                "weight_start_pct": round(item["weight_start_pct"], 4) if item["weight_start_pct"] is not None else None,
                "weight_end_pct": round(item["weight_end_pct"], 4) if item["weight_end_pct"] is not None else None,
                "holding_contribution": round(item["holding_contribution"], 2),
                "trade_contribution": round(item["trade_contribution"], 2),
                "contribution": round(item["contribution"], 2),
                "contribution_pct": (
                    round(item["contribution"] / equity_start * 100.0, 4) if equity_start > 0 else None
                ),
                "fact_id": item.get("fact_id"),
            }
            for item in ordered
        ]

        data = {
            "period_return_pct": (
                (equity_end - equity_start - net_cash_flow) / equity_start * 100.0
                if equity_start > 0
                else None
            ),
            "equity_start": round(equity_start, 2),
            "equity_end": round(equity_end, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "cash_flows": [
                {
                    "event_date": entry["event_date"].isoformat(),
                    "direction": entry["direction"],
                    "amount": round(float(entry["amount"]), 2),
                }
                for entry in sorted(cash_entries, key=lambda entry: entry["event_date"])
            ],
            "attribution": attribution_payload,
            "cash_drag": round(((cash_weight_start or 0.0) + (cash_weight_end or 0.0)) / 2.0, 4),
            "trades": [
                {
                    "trade_date": trade.trade_date.isoformat(),
                    "symbol": trade.symbol,
                    "side": trade.side,
                    "quantity": float(trade.quantity),
                    "price": float(trade.price),
                    "fee": float(trade.fee or 0.0),
                    "tax": float(trade.tax or 0.0),
                    "note": trade.note,
                }
                for trade in trades
            ],
            "reconciliation": {
                "parts_total": round(parts_total, 2),
                "expected_total": round(expected_total, 2),
                "difference": round(residual, 2),
                "tolerance": round(tolerance, 2),
                "reconciled": reconciled,
            },
        }
        return {"pack": builder.build(), "data": data}

    # ------------------------------------------------------------------
    # Data access
    # ------------------------------------------------------------------

    def _resolve_account(self, account_id: Optional[int]) -> Tuple[Optional[int], Any, str]:
        if account_id is not None:
            account = self.repo.get_account(int(account_id))
            if account is None:
                raise ValueError(f"Account {account_id} not found")
            return int(account_id), account, account.base_currency or "CNY"
        accounts = self.repo.list_accounts(include_inactive=False)
        if not accounts:
            raise ValueError("No active portfolio account found")
        return int(accounts[0].id), accounts[0], accounts[0].base_currency or "CNY"

    def _account_snapshot(
        self,
        account_id: Optional[int],
        as_of: date,
        cost_method: str,
    ) -> Optional[Dict[str, Any]]:
        snapshot = self.portfolio_service.get_portfolio_snapshot(
            account_id=account_id,
            as_of=as_of,
            cost_method=cost_method,
            include_realtime=False,
        )
        for entry in snapshot.get("accounts", []):
            if account_id is None or int(entry["account_id"]) == int(account_id):
                return entry
        return None

    def _query_all_trades(self, account_id: Optional[int], start: date, end: date) -> List[Any]:
        trades: List[Any] = []
        page = 1
        while True:
            rows, total = self.repo.query_trades(
                account_id=account_id,
                date_from=start,
                date_to=end,
                symbols=None,
                side=None,
                page=page,
                page_size=QUERY_PAGE_SIZE,
            )
            trades.extend(rows)
            if page * QUERY_PAGE_SIZE >= total or not rows:
                break
            page += 1
        trades.sort(key=lambda trade: (trade.trade_date, trade.id))
        return trades

    def _query_cash_flow(
        self,
        account_id: Optional[int],
        start: date,
        end: date,
        base_currency: str,
    ) -> Tuple[List[Dict[str, Any]], bool]:
        entries: List[Dict[str, Any]] = []
        mixed_currency = False
        page = 1
        while True:
            rows, total = self.repo.query_cash_ledger(
                account_id=account_id,
                date_from=start,
                date_to=end,
                direction=None,
                page=page,
                page_size=QUERY_PAGE_SIZE,
            )
            for row in rows:
                if (row.currency or base_currency) != base_currency:
                    mixed_currency = True
                entries.append(
                    {
                        "event_date": row.event_date,
                        "direction": row.direction,
                        "amount": float(row.amount),
                        "currency": row.currency,
                    }
                )
            if page * QUERY_PAGE_SIZE >= total or not rows:
                break
            page += 1
        return entries, mixed_currency

    @staticmethod
    def _aggregate_trades(trades: List[Any], base_currency: str) -> Dict[str, Dict[str, float]]:
        stats: Dict[str, Dict[str, float]] = {}
        for trade in trades:
            entry = stats.setdefault(
                trade.symbol,
                {
                    "buy_value": 0.0,
                    "sell_value": 0.0,
                    "buy_qty": 0.0,
                    "sell_qty": 0.0,
                    "fees": 0.0,
                    "mixed_currency": 0.0,
                },
            )
            value = float(trade.quantity) * float(trade.price)
            if trade.side == "buy":
                entry["buy_value"] += value
                entry["buy_qty"] += float(trade.quantity)
            elif trade.side == "sell":
                entry["sell_value"] += value
                entry["sell_qty"] += float(trade.quantity)
            entry["fees"] += float(trade.fee or 0.0) + float(trade.tax or 0.0)
            if (trade.currency or base_currency) != base_currency:
                entry["mixed_currency"] = 1.0
        return stats

    # ------------------------------------------------------------------
    # Attribution
    # ------------------------------------------------------------------

    def _attribute(
        self,
        *,
        positions_start: Dict[str, Dict[str, Any]],
        positions_end: Dict[str, Dict[str, Any]],
        trade_stats: Dict[str, Dict[str, float]],
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        symbols = sorted(set(positions_start) | set(positions_end) | set(trade_stats))
        equity_end_total = sum(float(p.get("market_value_base") or 0.0) for p in positions_end.values())
        equity_start_total = sum(float(p.get("market_value_base") or 0.0) for p in positions_start.values())

        items: List[Dict[str, Any]] = []
        price_gaps: List[str] = []
        for symbol in symbols:
            start_pos = positions_start.get(symbol)
            end_pos = positions_end.get(symbol)
            stats = trade_stats.get(symbol, {})

            mv_start = float(start_pos.get("market_value_base") or 0.0) if start_pos else 0.0
            mv_end = float(end_pos.get("market_value_base") or 0.0) if end_pos else 0.0
            quantity_start = float(start_pos.get("quantity") or 0.0) if start_pos else 0.0
            quantity_end = float(end_pos.get("quantity") or 0.0) if end_pos else 0.0
            market = (end_pos or start_pos or {}).get("market", "")

            for label, pos in (("期初", start_pos), ("期末", end_pos)):
                if pos and pos.get("price_available") is False:
                    price_gaps.append(f"{symbol} {label}价格缺失，市值沿用成本或旧价")
                elif pos and pos.get("price_stale"):
                    price_gaps.append(f"{symbol} {label}价格为缓存历史收盘价（非实时）")

            holding_contribution = mv_end - mv_start
            trade_contribution = (
                stats.get("sell_value", 0.0) - stats.get("buy_value", 0.0) - stats.get("fees", 0.0)
            )
            contribution = holding_contribution + trade_contribution

            expected_qty_delta = stats.get("buy_qty", 0.0) - stats.get("sell_qty", 0.0)
            actual_qty_delta = quantity_end - quantity_start
            qty_consistent = abs(actual_qty_delta - expected_qty_delta) <= max(1e-6, abs(quantity_end) * 1e-6)
            if not qty_consistent and (start_pos or end_pos or stats):
                price_gaps.append(
                    f"{symbol} 数量变动({actual_qty_delta:.0f})与期间交易({expected_qty_delta:.0f})不一致，可能存在拆股/股息再投"
                )

            items.append(
                {
                    "symbol": symbol,
                    "market": market,
                    "quantity_start": quantity_start,
                    "quantity_end": quantity_end,
                    "weight_start_pct": (mv_start / equity_start_total * 100.0) if equity_start_total > 0 else None,
                    "weight_end_pct": (mv_end / equity_end_total * 100.0) if equity_end_total > 0 else None,
                    "holding_contribution": holding_contribution,
                    "trade_contribution": trade_contribution,
                    "contribution": contribution,
                    "qty_consistent": qty_consistent,
                }
            )
        return items, price_gaps

    # ------------------------------------------------------------------
    # Evidence declarations
    # ------------------------------------------------------------------

    def _declare_inputs(
        self,
        builder: EvidencePackBuilder,
        *,
        account_name: str,
        start: date,
        end: date,
        trade_count: int,
        cash_entry_count: int,
        mixed_currency: bool,
        price_gaps: List[str],
    ) -> None:
        builder.add_input(
            "portfolio_snapshot(replay)",
            f"账户{('「' + account_name + '」') if account_name else ''}期初/期末快照：交易流水重放 + 缓存收盘价",
            date_range=[start.isoformat(), end.isoformat()],
            stale=True,
        )
        builder.add_input(
            "portfolio_trades",
            "期间成交记录（买/卖数量、价格、费用）",
            date_range=[start.isoformat(), end.isoformat()],
            row_count=trade_count,
        )
        builder.add_input(
            "portfolio_cash_ledger",
            "期间出入金记录",
            date_range=[start.isoformat(), end.isoformat()],
            row_count=cash_entry_count,
        )
        if mixed_currency:
            builder.add_gap(
                "warning",
                "存在非本币计价的出入金或交易，金额按面值加总未做汇率折算，归因差额可能因此放大",
            )
        for message in price_gaps[:8]:
            builder.add_gap("warning", message)

    @staticmethod
    def _declare_methods(builder: EvidencePackBuilder) -> None:
        builder.add_method(
            "逐标的归因 = 持仓市值变动 + 期间卖出回款 - 期间买入支出 - 交易费用",
            formula="contribution(s) = MV_end - MV_start + sells - buys - fees",
        )
        builder.add_method(
            "期间收益率以扣除净出入金后的净值变动计算",
            formula="return = (E_end - E_start - netCashFlow) / E_start",
        )
        builder.add_method(
            "对账校验：归因分项之和应等于净值变动减净出入金，差额超容差记为数据缺口",
        )

    def _add_risk_rules(
        self,
        builder: EvidencePackBuilder,
        *,
        account_id: Optional[int],
        as_of: date,
        cost_method: str,
    ) -> Dict[str, Any]:
        try:
            report = self.risk_service.get_risk_report(
                account_id=account_id,
                as_of=as_of,
                cost_method=cost_method,
                include_realtime=False,
            )
        except Exception as exc:  # noqa: BLE001 - rules are supplementary
            logger.warning("Review risk rule check failed: %s", exc)
            builder.add_gap("info", "期末风险规则检查不可用（风险服务调用失败）")
            return {}

        thresholds = report.get("thresholds", {}) or {}
        concentration = report.get("concentration", {}) or {}
        drawdown = report.get("drawdown", {}) or {}
        stop_loss = report.get("stop_loss", {}) or {}

        top_weight = concentration.get("top_weight_pct")
        if isinstance(top_weight, (int, float)):
            builder.add_rule(
                "single_position_concentration",
                current_value=float(top_weight),
                threshold=float(thresholds.get("concentration_alert_pct", 35.0)),
                operator=">",
            )
        max_dd = drawdown.get("max_drawdown_pct")
        if isinstance(max_dd, (int, float)):
            builder.add_rule(
                "max_drawdown",
                current_value=float(max_dd),
                threshold=float(thresholds.get("drawdown_alert_pct", 15.0)),
                operator=">",
            )
        triggered = int(stop_loss.get("triggered_count") or 0)
        builder.add_rule(
            "stop_loss_triggered_count",
            current_value=float(triggered),
            threshold=0.0,
            operator=">",
        )
        return report

    @staticmethod
    def _cash_weight(snapshot: Optional[Dict[str, Any]]) -> Optional[float]:
        if not snapshot:
            return None
        equity = float(snapshot.get("total_equity") or 0.0)
        if equity <= 0:
            return None
        return float(snapshot.get("total_cash") or 0.0) / equity
