# -*- coding: utf-8 -*-
"""Portfolio sandbox service: deterministic what-if and scenario replay.

What-if recomputes allocation metrics after weight adjustments using real
cached prices — no forecasting. Scenario replay projects a fixed-weight
portfolio through actual historical daily returns from stock_daily. Both are
pure arithmetic so every number can be recomputed by hand.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List, Optional

from src.config import Config, get_config
from src.repositories.insights_repo import DEFAULT_PROFILE, InsightsRepository
from src.repositories.portfolio_repo import PortfolioRepository
from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

MAX_SCENARIO_DAYS = 1500
WEIGHT_EPS = 1e-9


class PortfolioSandboxService:
    """Deterministic sandbox computations as evidence packs."""

    def __init__(
        self,
        *,
        repo: Optional[PortfolioRepository] = None,
        portfolio_service: Optional[PortfolioService] = None,
        insights_repo: Optional[InsightsRepository] = None,
        config: Optional[Config] = None,
    ):
        self.repo = repo or PortfolioRepository()
        self.portfolio_service = portfolio_service or PortfolioService(repo=self.repo)
        self.insights_repo = insights_repo or InsightsRepository()
        self.config = config or get_config()

    # ------------------------------------------------------------------
    # What-if
    # ------------------------------------------------------------------

    def what_if(
        self,
        *,
        account_id: Optional[int] = None,
        adjustments: List[Dict[str, Any]],
        cost_method: str = "fifo",
        as_of: Optional[date] = None,
    ) -> Dict[str, Any]:
        as_of_date = as_of or date.today()
        account_id = self._resolve_account_id(account_id)
        snapshot = self._account_snapshot(account_id, as_of_date, cost_method)
        if snapshot is None:
            raise ValueError("No snapshot available for the account")

        equity = float(snapshot.get("total_equity") or 0.0)
        cash = float(snapshot.get("total_cash") or 0.0)
        positions = snapshot.get("positions", [])
        if equity <= 0:
            raise ValueError("Account equity is not positive")

        profile = self._load_profile()
        by_symbol = {position["symbol"]: position for position in positions}
        market_values: Dict[str, float] = {
            symbol: float(position.get("market_value_base") or 0.0)
            for symbol, position in by_symbol.items()
        }

        for adjustment in adjustments:
            symbol = str(adjustment.get("symbol") or "").strip()
            delta_pct = float(adjustment.get("delta_weight_pct") or 0.0)
            if not symbol:
                raise ValueError("adjustment.symbol is required")
            if abs(delta_pct) > 100.0:
                raise ValueError(f"adjustment for {symbol} exceeds ±100 percentage points")
            new_value = market_values.get(symbol, 0.0) + delta_pct / 100.0 * equity
            if new_value < -1e-6:
                raise ValueError(
                    f"adjustment for {symbol} implies a negative position value ({new_value:,.0f})"
                )
            market_values[symbol] = max(0.0, new_value)

        invested_delta = sum(
            market_values[symbol] - float(by_symbol.get(symbol, {}).get("market_value_base") or 0.0)
            for symbol in market_values
        )
        cash_after = cash - invested_delta
        if cash_after < -1e-6:
            raise ValueError(
                f"调整需要现金 {invested_delta:,.0f} 元，超过当前现金 {cash:,.0f} 元"
            )
        cash_after = max(0.0, cash_after)

        weights_before = {
            symbol: float(position.get("market_value_base") or 0.0) / equity * 100.0
            for symbol, position in by_symbol.items()
        }
        weights_after = {symbol: value / equity * 100.0 for symbol, value in market_values.items() if value > WEIGHT_EPS}
        cash_weight_before = cash / equity * 100.0
        cash_weight_after = cash_after / equity * 100.0

        builder = EvidencePackBuilder(pack_type="sandbox", account_id=account_id, as_of=as_of_date)
        builder.add_input(
            "portfolio_snapshot(replay)",
            "当前组合快照（缓存收盘价）作为 what-if 基线",
            stale=True,
        )
        builder.add_method(
            "what-if 仅重算配置指标：新市值 = 原市值 + 调整百分点 × 总净值，现金吸收差额；不预测收益",
            formula="mv_after = mv_before + delta_pct × equity",
        )

        fact_equity = builder.add_fact("总净值（调整前后不变）", round(equity, 2), unit="元", precision=2)
        fact_cash_before = builder.add_fact("调整前现金占比", round(cash_weight_before, 2), unit="%", precision=2)
        fact_cash_after = builder.add_fact("调整后现金占比", round(cash_weight_after, 2), unit="%", precision=2)
        max_before = max(weights_before.values()) if weights_before else 0.0
        max_after = max(weights_after.values()) if weights_after else 0.0
        builder.add_fact("最大单一持仓权重（调整前）", round(max_before, 2), unit="%", precision=2)
        builder.add_fact("最大单一持仓权重（调整后）", round(max_after, 2), unit="%", precision=2)

        cap = profile["single_position_cap_pct"]
        floor = profile["cash_floor_pct"]
        for symbol, weight in sorted(weights_after.items(), key=lambda kv: kv[1], reverse=True):
            builder.add_rule(
                "single_position_cap_after",
                current_value=round(weight, 4),
                threshold=cap,
                operator=">",
                related_fact_ids=[fact_equity],
            )
        builder.add_rule(
            "cash_floor_after",
            current_value=round(cash_weight_after, 4),
            threshold=floor,
            operator="<",
            related_fact_ids=[fact_cash_before, fact_cash_after],
        )
        triggered = [rule for rule in builder.triggered_rules()]
        if triggered:
            builder.add_gap(
                "warning",
                f"调整后将触发 {len(triggered)} 条规则告警（见规则列表）",
            )

        positions_after = [
            {
                "symbol": symbol,
                "name": by_symbol.get(symbol, {}).get("name", ""),
                "weight_before_pct": round(weights_before.get(symbol, 0.0), 4),
                "weight_after_pct": round(weight, 4),
            }
            for symbol, weight in sorted(weights_after.items(), key=lambda kv: kv[1], reverse=True)
        ]

        return {
            "pack": builder.build(),
            "data": {
                "total_equity": round(equity, 2),
                "positions": positions_after,
                "max_position_weight_before_pct": round(max_before, 4),
                "max_position_weight_after_pct": round(max_after, 4),
                "cash_weight_before_pct": round(cash_weight_before, 4),
                "cash_weight_after_pct": round(cash_weight_after, 4),
                "positions_after": [
                    {
                        "symbol": symbol,
                        "market_value": round(market_values[symbol], 2),
                        "weight_pct": round(weights_after[symbol], 4),
                    }
                    for symbol in weights_after
                ],
            },
        }

    # ------------------------------------------------------------------
    # Historical scenario replay
    # ------------------------------------------------------------------

    def scenario(
        self,
        *,
        account_id: Optional[int] = None,
        start_date: date,
        end_date: date,
        proposed_weights: Dict[str, float],
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        comparison = self.project_comparison(
            account_id=account_id,
            start_date=start_date,
            end_date=end_date,
            proposed_weights=proposed_weights,
            cost_method=cost_method,
        )
        comparison_data = comparison["data"]

        builder = EvidencePackBuilder(pack_type="sandbox", account_id=comparison["account_id"], as_of=comparison_data["end_date"])
        builder.add_input(
            "stock_daily",
            f"历史收盘价（{comparison_data['start_date']} ~ {comparison_data['end_date']}，缓存）",
            date_range=[comparison_data["start_date"], comparison_data["end_date"]],
            stale=True,
        )
        builder.add_method(
            "固定权重逐日投影：组合日收益 = Σ 权重 × 个股日收益，现金收益记 0，不含费用/滑点/再平衡",
            formula="r_p(t) = Σ w_i × r_i(t)",
        )
        builder.add_method(
            "基线 = 当前实际权重；实验 = 指定权重 + 未指定持仓按比例填充剩余额度",
        )
        for symbol in comparison["missing"]:
            builder.add_gap("warning", f"{symbol} 在窗口内无足够历史行情，已从回放中剔除")
        if comparison["critical"]:
            builder.add_gap("critical", comparison["critical"])

        data = comparison_data
        if data["baseline_return_pct"] is not None and data["proposed_return_pct"] is not None:
            fact_baseline = builder.add_fact("基线组合历史收益", round(data["baseline_return_pct"], 4), unit="%", precision=4)
            fact_proposed = builder.add_fact("实验组合历史收益", round(data["proposed_return_pct"], 4), unit="%", precision=4)
            builder.add_fact(
                "实验相对基线差异",
                round(data["proposed_return_pct"] - data["baseline_return_pct"], 4),
                unit="%",
                precision=4,
                source_fact_ids=[fact_baseline, fact_proposed],
            )
        builder.add_fact(
            "基线最大回撤",
            round(data["baseline_max_drawdown_pct"], 4) if data["baseline_max_drawdown_pct"] is not None else None,
            unit="%",
            precision=4,
        )
        builder.add_fact(
            "实验最大回撤",
            round(data["proposed_max_drawdown_pct"], 4) if data["proposed_max_drawdown_pct"] is not None else None,
            unit="%",
            precision=4,
        )
        builder.add_gap("info", "历史确定性投影不代表未来收益；未包含交易费用、滑点与税费")

        return {"pack": builder.build(), "data": data}

    def project_comparison(
        self,
        *,
        account_id: Optional[int] = None,
        start_date: date,
        end_date: date,
        proposed_weights: Dict[str, float],
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        """Deterministic two-line replay: baseline (current weights) vs proposed.

        Shared by the sandbox scenario view and the rebalance plan comparison.
        """
        if start_date > end_date:
            raise ValueError("start_date must not be after end_date")
        if (end_date - start_date).days > MAX_SCENARIO_DAYS:
            raise ValueError(f"Scenario window must not exceed {MAX_SCENARIO_DAYS} days")
        today = date.today()
        if end_date > today:
            end_date = today
        for symbol, weight in proposed_weights.items():
            if weight < 0.0 or weight > 1.0:
                raise ValueError(f"proposed weight for {symbol} must be within [0, 1]")
        if sum(proposed_weights.values()) > 1.0 + 1e-6:
            raise ValueError("proposed weights must sum to at most 1.0")

        account_id = self._resolve_account_id(account_id)
        snapshot = self._account_snapshot(account_id, end_date, cost_method)
        if snapshot is None:
            raise ValueError("No snapshot available for the account")
        equity = float(snapshot.get("total_equity") or 0.0)
        if equity <= 0:
            raise ValueError("Account equity is not positive")

        baseline_weights: Dict[str, float] = {}
        for position in snapshot.get("positions", []):
            market_value = float(position.get("market_value_base") or 0.0)
            if market_value > WEIGHT_EPS:
                baseline_weights[position["symbol"]] = market_value / equity

        final_weights = dict(proposed_weights)
        unspecified = {
            symbol: weight for symbol, weight in baseline_weights.items() if symbol not in proposed_weights
        }
        remainder = 1.0 - sum(final_weights.values())
        unspecified_total = sum(unspecified.values())
        if unspecified_total > WEIGHT_EPS and remainder > WEIGHT_EPS:
            scale = remainder / unspecified_total
            for symbol, weight in unspecified.items():
                final_weights[symbol] = weight * scale

        symbols = sorted(
            {symbol for symbol, weight in final_weights.items() if weight > WEIGHT_EPS}
            | {symbol for symbol, weight in baseline_weights.items() if weight > WEIGHT_EPS}
        )
        closes_map = self._resolve_closes(symbols, start_date, end_date)
        usable = {symbol: closes for symbol, closes in closes_map.items() if len(closes) >= 2}
        missing = [symbol for symbol in symbols if symbol not in usable]

        critical = ""
        series: List[Dict[str, Any]] = []
        baseline_return = proposed_return = baseline_dd = proposed_dd = None
        if not usable:
            critical = "窗口内所有标的均无历史行情，无法回放"
        else:
            common_dates = sorted(set.intersection(*[set(closes) for closes in usable.values()]))
            if len(common_dates) < 2:
                critical = "共同交易日不足两天，无法回放"
                common_dates = []
            baseline_series, proposed_series = self._project(
                dates=common_dates,
                closes=usable,
                baseline_weights=baseline_weights,
                proposed_weights=final_weights,
            )
            baseline_return = self._total_return(baseline_series)
            proposed_return = self._total_return(proposed_series)
            baseline_dd = self._max_drawdown(baseline_series)
            proposed_dd = self._max_drawdown(proposed_series)
            series = [
                {
                    "date": common_dates[index].isoformat(),
                    "baseline_equity": round(baseline_series[index], 4),
                    "proposed_equity": round(proposed_series[index], 4) if proposed_series else None,
                }
                for index in range(len(common_dates))
            ]

        data = {
            "start_date": series[0]["date"] if series else start_date.isoformat(),
            "end_date": series[-1]["date"] if series else end_date.isoformat(),
            "baseline_return_pct": round(baseline_return, 4) if baseline_return is not None else None,
            "proposed_return_pct": round(proposed_return, 4) if proposed_return is not None else None,
            "baseline_max_drawdown_pct": round(baseline_dd, 4) if baseline_dd is not None else None,
            "proposed_max_drawdown_pct": round(proposed_dd, 4) if proposed_dd is not None else None,
            "series": series,
            "weights_used": {symbol: round(weight, 6) for symbol, weight in final_weights.items() if weight > WEIGHT_EPS},
        }
        return {
            "account_id": account_id,
            "baseline_weights": baseline_weights,
            "final_weights": final_weights,
            "missing": missing,
            "critical": critical,
            "data": data,
        }

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _resolve_account_id(self, account_id: Optional[int]) -> Optional[int]:
        if account_id is not None:
            if self.repo.get_account(int(account_id)) is None:
                raise ValueError(f"Account {account_id} not found")
            return int(account_id)
        accounts = self.repo.list_accounts(include_inactive=False)
        if not accounts:
            raise ValueError("No active portfolio account found")
        return int(accounts[0].id)

    def _account_snapshot(self, account_id: Optional[int], as_of: date, cost_method: str) -> Optional[Dict[str, Any]]:
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

    def _load_profile(self) -> Dict[str, float]:
        try:
            row = self.insights_repo.get_profile("default")
        except Exception:  # noqa: BLE001
            row = None
        if row:
            return {key: float(row[key]) for key in DEFAULT_PROFILE}
        return dict(DEFAULT_PROFILE)

    def _resolve_closes(
        self,
        symbols: List[str],
        start_date: date,
        end_date: date,
    ) -> Dict[str, Dict[date, float]]:
        """Resolve stock_daily codes for portfolio symbols (handles hk prefix)."""
        result: Dict[str, Dict[date, float]] = {}
        pending: List[str] = []
        candidate_map: Dict[str, List[str]] = {}
        for symbol in symbols:
            candidates = [symbol]
            lowered = symbol.lower()
            if not lowered.startswith("hk"):
                candidates.append(f"hk{lowered.zfill(5)}")
                candidates.append(f"hk{lowered}")
            candidates.append(symbol.upper())
            candidate_map[symbol] = list(dict.fromkeys(candidates))
            pending.extend(candidate_map[symbol])

        closes = self.repo.list_daily_closes(
            symbols=list(dict.fromkeys(pending)),
            start_date=start_date,
            end_date=end_date,
        )
        for symbol in symbols:
            for candidate in candidate_map[symbol]:
                if closes.get(candidate):
                    result[symbol] = closes[candidate]
                    break
        return result

    @staticmethod
    def _project(
        *,
        dates: List[date],
        closes: Dict[str, Dict[date, float]],
        baseline_weights: Dict[str, float],
        proposed_weights: Dict[str, float],
    ) -> tuple[List[float], List[float]]:
        baseline_series: List[float] = [100.0]
        proposed_series: List[float] = [100.0]
        for index in range(1, len(dates)):
            previous, current = dates[index - 1], dates[index]
            baseline_return = 0.0
            proposed_return = 0.0
            for symbol, series in closes.items():
                price_prev = series.get(previous)
                price_now = series.get(current)
                if not price_prev or not price_now or price_prev <= 0:
                    continue
                daily_return = price_now / price_prev - 1.0
                baseline_return += baseline_weights.get(symbol, 0.0) * daily_return
                proposed_return += proposed_weights.get(symbol, 0.0) * daily_return
            baseline_series.append(baseline_series[-1] * (1.0 + baseline_return))
            proposed_series.append(proposed_series[-1] * (1.0 + proposed_return))
        return baseline_series, proposed_series

    @staticmethod
    def _total_return(series: List[float]) -> Optional[float]:
        if len(series) < 2 or series[0] <= 0:
            return None
        return (series[-1] / series[0] - 1.0) * 100.0

    @staticmethod
    def _max_drawdown(series: List[float]) -> Optional[float]:
        if len(series) < 2:
            return None
        peak = series[0]
        max_dd = 0.0
        for value in series:
            if value > peak:
                peak = value
            if peak > 0:
                drawdown = (peak - value) / peak
                if drawdown > max_dd:
                    max_dd = drawdown
        return max_dd * 100.0
