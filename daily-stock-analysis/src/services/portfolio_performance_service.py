# -*- coding: utf-8 -*-
"""Portfolio performance service: equity series + deterministic metrics.

Reads replayed daily snapshots (backfilling missing days on demand) and
computes period return, annualized return/volatility, Sharpe ratio and max
drawdown. All numbers are wrapped in an EvidencePack so the AI layer can only
cite computed facts.
"""

from __future__ import annotations

import logging
import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from src.config import Config, get_config
from src.repositories.portfolio_repo import PortfolioRepository
from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

TRADING_DAYS_PER_YEAR = 252.0
MAX_WINDOW_DAYS = 3650


class PortfolioPerformanceService:
    """Compute portfolio performance series and metrics as evidence packs."""

    def __init__(
        self,
        *,
        repo: Optional[PortfolioRepository] = None,
        portfolio_service: Optional[PortfolioService] = None,
        config: Optional[Config] = None,
    ):
        self.repo = repo or PortfolioRepository()
        self.portfolio_service = portfolio_service or PortfolioService(repo=self.repo)
        self.config = config or get_config()

    def get_performance(
        self,
        *,
        account_id: Optional[int] = None,
        days: int = 180,
        as_of: Optional[date] = None,
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        as_of_date = as_of or date.today()
        window_days = max(7, min(int(days or 180), MAX_WINDOW_DAYS))

        account_id, account_name = self._resolve_account(account_id)
        self._ensure_snapshot_window(
            account_id=account_id,
            as_of_date=as_of_date,
            cost_method=cost_method,
            lookback_days=window_days,
        )
        rows = self.repo.list_daily_snapshots_for_risk(
            as_of=as_of_date,
            cost_method=cost_method,
            account_id=account_id,
            lookback_days=window_days,
        )
        if account_id is not None:
            rows = [row for row in rows if int(row.account_id) == int(account_id)]

        raw_series = [
            {
                "date": row.snapshot_date.isoformat(),
                "equity": float(row.total_equity),
                "cash": float(row.total_cash),
                "market_value": float(row.total_market_value),
            }
            for row in rows
            if row.total_equity is not None
        ]

        series, dropped = self._collapse_flat_stretches(raw_series)
        metrics = self._compute_metrics(series)
        risk_free_rate = float(getattr(self.config, "portfolio_risk_free_rate_pct", 1.5))

        builder = EvidencePackBuilder(
            pack_type="review",
            account_id=account_id,
            as_of=as_of_date,
        )
        builder.add_input(
            "portfolio_daily_snapshots",
            f"账户{('「' + account_name + '」') if account_name else ''}每日净值快照（重放生成，缓存收盘价）",
            date_range=[series[0]["date"], series[-1]["date"]] if series else None,
            row_count=len(series),
            stale=True,
        )
        builder.add_method(
            "净值序列来自交易流水逐日重放；相邻净值完全相同的连续日期合并为一点（非交易日不产生收益）",
        )
        builder.add_method(
            "年化收益 = (期末净值/期初净值)^(252/交易日数) - 1",
            formula="annualized = (E_end/E_start)^(252/n) - 1",
        )
        builder.add_method(
            "年化波动率 = 日收益率标准差 × √252；夏普 = (年化收益 - 无风险利率) / 年化波动率",
            formula="sharpe = (annualized - rf) / vol",
        )

        if series:
            start_fact = builder.add_fact("期初净值", series[0]["equity"], unit="元", precision=2)
            end_fact = builder.add_fact("期末净值", series[-1]["equity"], unit="元", precision=2)
            builder.add_fact("交易日数", metrics["trading_days"])
            if metrics["period_return_pct"] is not None:
                builder.add_fact(
                    "期间收益率",
                    round(metrics["period_return_pct"], 4),
                    unit="%",
                    precision=4,
                    source_fact_ids=[start_fact, end_fact],
                )
            if metrics["annualized_return_pct"] is not None:
                builder.add_fact("年化收益率", round(metrics["annualized_return_pct"], 4), unit="%", precision=4)
            if metrics["annualized_volatility_pct"] is not None:
                builder.add_fact("年化波动率", round(metrics["annualized_volatility_pct"], 4), unit="%", precision=4)
            if metrics["sharpe_ratio"] is not None:
                builder.add_fact("夏普比率", round(metrics["sharpe_ratio"], 4), precision=4)
            if metrics["max_drawdown_pct"] is not None:
                builder.add_fact("最大回撤", round(metrics["max_drawdown_pct"], 4), unit="%", precision=4)
        else:
            builder.add_gap("critical", "窗口内没有任何净值快照，无法计算绩效指标")

        if dropped:
            builder.add_gap(
                "info",
                f"合并了 {dropped} 个净值无变化的连续日期点（周末/节假日/无行情日）",
            )
        self._flag_cash_flow_limitation(builder, account_id=account_id, series=series)
        if metrics["period_return_pct"] is None and series:
            builder.add_gap("warning", "期初净值非正，收益率类指标不可计算")

        metrics_payload = dict(metrics)
        metrics_payload["risk_free_rate_pct"] = risk_free_rate
        return {
            "pack": builder.build(),
            "data": {"series": series, "metrics": metrics_payload},
        }

    def get_daily_pnl_series(
        self,
        *,
        days: int = 120,
        as_of: Optional[date] = None,
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        """Aggregate daily equity across all active accounts and derive daily PnL.

        Daily PnL = equity(t) - equity(t-1) - net_cash_flow(t). Days with
        unchanged equity stay in the series (weekends read as 0) so the
        calendar grid stays honest about "no movement".
        """
        as_of_date = as_of or date.today()
        window_days = max(30, min(int(days or 120), MAX_WINDOW_DAYS))
        accounts = self.repo.list_accounts(include_inactive=False)
        if not accounts:
            return {"series": [], "account_count": 0}

        per_account: List[Dict[str, Any]] = []
        for account in accounts:
            self._ensure_snapshot_window(
                account_id=int(account.id),
                as_of_date=as_of_date,
                cost_method=cost_method,
                lookback_days=window_days,
            )
            rows = self.repo.list_daily_snapshots_for_risk(
                as_of=as_of_date,
                cost_method=cost_method,
                account_id=int(account.id),
                lookback_days=window_days,
            )
            per_account.append(
                {
                    "account_id": int(account.id),
                    "rows": [
                        (row.snapshot_date, float(row.total_equity))
                        for row in rows
                        if row.total_equity is not None
                    ],
                }
            )

        all_dates = sorted({row_date for account in per_account for row_date, _ in account["rows"]})
        if not all_dates:
            return {"series": [], "account_count": len(accounts)}

        latest: Dict[int, float] = {}
        series: List[Dict[str, Any]] = []
        for current in all_dates:
            for account in per_account:
                for row_date, equity in account["rows"]:
                    if row_date == current:
                        latest[account["account_id"]] = equity
            series.append({"date": current.isoformat(), "equity": sum(latest.values())})

        cash_flows = self._daily_cash_flows(all_dates[0], all_dates[-1])
        result: List[Dict[str, Any]] = []
        for index, point in enumerate(series):
            if index == 0:
                continue
            previous = series[index - 1]["equity"]
            flow = cash_flows.get(point["date"], 0.0)
            pnl = point["equity"] - previous - flow
            result.append(
                {
                    "date": point["date"],
                    "equity": round(point["equity"], 2),
                    "pnl": round(pnl, 2),
                    "pnl_pct": round(pnl / previous * 100.0, 4) if previous > 0 else None,
                }
            )
        return {"series": result, "account_count": len(accounts)}

    def _daily_cash_flows(self, start: date, end: date) -> Dict[str, float]:
        flows: Dict[str, float] = {}
        try:
            page = 1
            while True:
                rows, total = self.repo.query_cash_ledger(
                    account_id=None,
                    date_from=start,
                    date_to=end,
                    direction=None,
                    page=page,
                    page_size=500,
                )
                for row in rows:
                    key = row.event_date.isoformat()
                    amount = float(row.amount)
                    flows[key] = flows.get(key, 0.0) + (amount if row.direction == "in" else -amount)
                if page * 500 >= total or not rows:
                    break
                page += 1
        except Exception:  # noqa: BLE001 - cash-flow adjustment is best-effort
            logger.warning("Daily cash flow lookup failed", exc_info=True)
        return flows

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _resolve_account(self, account_id: Optional[int]) -> tuple[Optional[int], str]:
        if account_id is not None:
            account = self.repo.get_account(int(account_id))
            if account is None:
                raise ValueError(f"Account {account_id} not found")
            return int(account_id), account.name or ""
        accounts = self.repo.list_accounts(include_inactive=False)
        if not accounts:
            return None, ""
        return int(accounts[0].id), accounts[0].name or ""

    def _ensure_snapshot_window(
        self,
        *,
        account_id: Optional[int],
        as_of_date: date,
        cost_method: str,
        lookback_days: int,
    ) -> None:
        """Backfill missing daily snapshots so the series is dense."""
        first_activity = self.repo.get_first_activity_date(account_id=account_id, as_of=as_of_date)
        start_date = as_of_date - timedelta(days=lookback_days)
        if first_activity is not None and first_activity > start_date:
            start_date = first_activity
        if start_date > as_of_date:
            return

        existing = self.repo.list_daily_snapshots_for_risk(
            as_of=as_of_date,
            cost_method=cost_method,
            account_id=account_id,
            lookback_days=lookback_days,
        )
        existing_dates = {row.snapshot_date for row in existing}
        current = start_date
        while current <= as_of_date:
            if current not in existing_dates:
                try:
                    self.portfolio_service.get_portfolio_snapshot(
                        account_id=account_id,
                        as_of=current,
                        cost_method=cost_method,
                        include_realtime=False,
                    )
                except Exception as exc:  # noqa: BLE001 - keep the series partial rather than fail hard
                    logger.warning("Performance snapshot backfill failed for %s: %s", current, exc)
            current += timedelta(days=1)

    @staticmethod
    def _collapse_flat_stretches(series: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], int]:
        """Collapse consecutive points with identical equity (non-trading days)."""
        collapsed: List[Dict[str, Any]] = []
        dropped = 0
        for point in series:
            if collapsed and abs(point["equity"] - collapsed[-1]["equity"]) < 1e-9:
                collapsed[-1] = point  # keep the latest date of the flat stretch
                dropped += 1
                continue
            collapsed.append(dict(point))
        return collapsed, dropped

    def _compute_metrics(self, series: List[Dict[str, Any]]) -> Dict[str, Any]:
        metrics: Dict[str, Any] = {
            "period_return_pct": None,
            "annualized_return_pct": None,
            "annualized_volatility_pct": None,
            "sharpe_ratio": None,
            "max_drawdown_pct": None,
            "trading_days": 0,
        }
        if len(series) < 2:
            return metrics

        equities = [point["equity"] for point in series]
        start, end = equities[0], equities[-1]
        n = len(equities) - 1
        metrics["trading_days"] = n

        if start > 0 and end > 0:
            metrics["period_return_pct"] = (end / start - 1.0) * 100.0
            if n > 0:
                metrics["annualized_return_pct"] = (
                    math.pow(end / start, TRADING_DAYS_PER_YEAR / n) - 1.0
                ) * 100.0

        daily_returns = [
            equities[i] / equities[i - 1] - 1.0
            for i in range(1, len(equities))
            if equities[i - 1] > 0
        ]
        if len(daily_returns) >= 2:
            mean = sum(daily_returns) / len(daily_returns)
            variance = sum((r - mean) ** 2 for r in daily_returns) / (len(daily_returns) - 1)
            volatility = math.sqrt(variance) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0
            if volatility > 1e-9:
                metrics["annualized_volatility_pct"] = volatility
                annualized = metrics["annualized_return_pct"]
                if annualized is not None:
                    risk_free = float(getattr(self.config, "portfolio_risk_free_rate_pct", 1.5))
                    metrics["sharpe_ratio"] = (annualized - risk_free) / volatility

        peak = equities[0]
        max_drawdown = 0.0
        for equity in equities:
            if equity > peak:
                peak = equity
            if peak > 0:
                drawdown = (peak - equity) / peak
                if drawdown > max_drawdown:
                    max_drawdown = drawdown
        metrics["max_drawdown_pct"] = max_drawdown * 100.0
        return metrics

    def _flag_cash_flow_limitation(
        self,
        builder: EvidencePackBuilder,
        *,
        account_id: Optional[int],
        series: List[Dict[str, Any]],
    ) -> None:
        if not series or account_id is None:
            return
        try:
            entries, _total = self.repo.query_cash_ledger(
                account_id=account_id,
                date_from=date.fromisoformat(series[0]["date"]),
                date_to=date.fromisoformat(series[-1]["date"]),
                direction=None,
                page=1,
                page_size=1,
            )
        except Exception:  # noqa: BLE001 - informational only
            return
        if entries:
            builder.add_gap(
                "warning",
                "期间存在出入金记录，净值序列与收益率未做现金流调整（简单收益率口径）",
            )
