# -*- coding: utf-8 -*-
"""AI rebalance plan service.

Builds a deterministic rebalance plan from four explainable inputs:
investor-profile thresholds (single-position cap, stop-loss, drift band,
cash floor), the daily-stock-analysis decision agent's active defensive
signals (sell/reduce), position unrealized PnL and the 30-day baseline
weights. All adjustments are reduce-only; freed cash raises the cash
weight instead of generating buy orders. The plan is paired with a
two-line historical replay (plan weights vs no-rebalance baseline) so
the user can compare before confirming execution.
"""

from __future__ import annotations

import hashlib
import logging
import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from src.config import Config, get_config
from src.repositories.insights_repo import DEFAULT_PROFILE, InsightsRepository
from src.repositories.portfolio_repo import PortfolioRepository
from src.services.decision_signal_service import DecisionSignalService
from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_sandbox_service import PortfolioSandboxService
from src.services.portfolio_service import (
    PortfolioBusyError,
    PortfolioConflictError,
    PortfolioOversellError,
    PortfolioService,
)

logger = logging.getLogger(__name__)

ESTIMATED_FEE_RATE = 0.0005  # commission estimate, both sides
STAMP_DUTY_RATE = 0.0005  # A-share sell-side stamp duty
LOT_SIZE_CN = 100
MIN_TRADE_VALUE = 500.0
DEFENSIVE_ACTIONS = ("sell", "reduce")
DEFAULT_WINDOW_DAYS = 90
DRIFT_LOOKBACK_DAYS = 30


class PlanStaleError(Exception):
    """Raised when the plan changed between preview and execution."""


class PortfolioRebalanceService:
    """Deterministic rebalance plans grounded in rules + AI decision signals."""

    def __init__(
        self,
        *,
        repo: Optional[PortfolioRepository] = None,
        portfolio_service: Optional[PortfolioService] = None,
        sandbox_service: Optional[PortfolioSandboxService] = None,
        decision_signal_service: Optional[DecisionSignalService] = None,
        insights_repo: Optional[InsightsRepository] = None,
        config: Optional[Config] = None,
    ):
        self.repo = repo or PortfolioRepository()
        self.portfolio_service = portfolio_service or PortfolioService(repo=self.repo)
        self.sandbox_service = sandbox_service or PortfolioSandboxService(
            repo=self.repo,
            portfolio_service=self.portfolio_service,
        )
        self.decision_signal_service = decision_signal_service or DecisionSignalService(
            portfolio_repo=self.repo
        )
        self.insights_repo = insights_repo or InsightsRepository()
        self.config = config or get_config()

    # ------------------------------------------------------------------
    # Plan
    # ------------------------------------------------------------------

    def build_plan(
        self,
        *,
        account_id: Optional[int] = None,
        window_days: int = DEFAULT_WINDOW_DAYS,
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        as_of_date = date.today()
        account_id = self._resolve_account_id(account_id)
        snapshot = self.portfolio_service.get_portfolio_snapshot(
            account_id=account_id,
            as_of=as_of_date,
            cost_method=cost_method,
            include_realtime=False,
        )
        account = next(
            (
                entry
                for entry in snapshot.get("accounts", [])
                if int(entry["account_id"]) == int(account_id)
            ),
            None,
        )
        if account is None:
            raise ValueError("No snapshot available for the account")
        equity = float(account.get("total_equity") or 0.0)
        cash = float(account.get("total_cash") or 0.0)
        if equity <= 0:
            raise ValueError("Account equity is not positive")

        profile, profile_source = self._load_profile()
        positions = account.get("positions", [])
        weights: Dict[str, Dict[str, Any]] = {}
        for position in positions:
            market_value = float(position.get("market_value_base") or 0.0)
            if market_value <= 0:
                continue
            weights[position["symbol"]] = {
                "market": position.get("market", "cn"),
                "signal_code": position.get("signal_stock_code") or position.get("symbol"),
                "last_price": float(position.get("last_price") or 0.0),
                "quantity": float(position.get("quantity") or 0.0),
                "market_value": market_value,
                "weight": market_value / equity,
                "unrealized_pnl_pct": position.get("unrealized_pnl_pct"),
            }

        signals = self._active_defensive_signals(weights)

        cap = profile["single_position_cap_pct"] / 100.0
        floor = profile["cash_floor_pct"] / 100.0
        stop_loss_pct = profile["stop_loss_pct"]
        drift_threshold = profile["rebalance_threshold_pct"] / 100.0

        targets: Dict[str, float] = {symbol: info["weight"] for symbol, info in weights.items()}
        reasons: Dict[str, List[str]] = {symbol: [] for symbol in weights}
        hard_targets: Dict[str, bool] = {symbol: False for symbol in weights}

        builder = EvidencePackBuilder(pack_type="strategy", account_id=account_id, as_of=as_of_date)
        builder.add_input("portfolio_snapshot(replay)", "当前组合快照（缓存收盘价）", stale=True)
        builder.add_input(
            "portfolio_investor_profile",
            f"投资者画像阈值（来源：{'个人画像' if profile_source == 'investor_profile' else '系统默认'}）",
        )
        builder.add_input(
            "decision_signals",
            "daily-stock-analysis 决策 Agent 的活跃防御性信号（sell/reduce）",
            row_count=len(signals),
        )
        builder.add_input(
            "baseline_snapshot",
            f"{DRIFT_LOOKBACK_DAYS} 天前基线快照（用于权重漂移回归，缺失时跳过该规则）",
        )

        for symbol, info in weights.items():
            if info["weight"] > cap:
                targets[symbol] = cap
                hard_targets[symbol] = True
                reasons[symbol].append(
                    f"权重 {info['weight'] * 100:.1f}% 超过单一持仓上限 {cap * 100:.1f}%"
                )
            signal = signals.get(symbol)
            if signal:
                action = signal["action"]
                if action == "sell":
                    hard_targets[symbol] = True
                    targets[symbol] = 0.0
                    reasons[symbol].append(f"决策信号 {signal['id']} 建议卖出（清仓）")
                elif action == "reduce":
                    reduced = min(targets[symbol] / 2.0, cap)
                    if reduced < targets[symbol]:
                        targets[symbol] = reduced
                        reasons[symbol].append(
                            f"决策信号 {signal['id']} 建议减持（减半至 {reduced * 100:.1f}%）"
                        )

        for symbol, info in weights.items():
            pnl_pct = info.get("unrealized_pnl_pct")
            if pnl_pct is None:
                continue
            pnl_pct = float(pnl_pct)
            builder.add_rule(
                "stop_loss",
                current_value=round(pnl_pct, 4),
                threshold=-stop_loss_pct,
                operator="<",
            )
            if pnl_pct >= -stop_loss_pct:
                continue
            halved = min(targets[symbol] / 2.0, cap)
            if halved < targets[symbol]:
                targets[symbol] = halved
                hard_targets[symbol] = True
                reasons[symbol].append(
                    f"浮亏 {pnl_pct:.1f}% 触及止损线 -{stop_loss_pct:.1f}%（防御性减半至 {halved * 100:.1f}%）"
                )

        baseline_weights = self._baseline_weights(account_id, as_of_date, cost_method)
        if baseline_weights is None:
            builder.add_gap("info", f"{DRIFT_LOOKBACK_DAYS} 天前无有效快照，跳过漂移回归检查")
        else:
            for symbol, info in weights.items():
                baseline = baseline_weights.get(symbol)
                if baseline is None or baseline <= 0:
                    continue
                drift = info["weight"] - baseline
                builder.add_rule(
                    "weight_drift",
                    current_value=round(abs(drift) * 100.0, 4),
                    threshold=profile["rebalance_threshold_pct"],
                    operator=">",
                )
                if drift <= drift_threshold:
                    continue
                if baseline < targets[symbol]:
                    targets[symbol] = baseline
                    reasons[symbol].append(
                        f"权重较 {DRIFT_LOOKBACK_DAYS} 天前上漂 {drift * 100:.1f}pp，回归基线 {baseline * 100:.1f}%"
                    )

        cash_after = 1.0 - sum(targets.values())
        if cash_after < floor:
            shortfall = floor - cash_after
            invested = sum(targets.values())
            if invested > 0:
                scale = max(0.0, (invested - shortfall) / invested)
                for symbol in targets:
                    targets[symbol] *= scale
                for symbol in targets:
                    reasons[symbol].append(
                        f"按比例压缩以满足现金底仓 {floor * 100:.1f}%"
                    )
            cash_after = 1.0 - sum(targets.values())

        trades = self._build_trades(weights, targets, equity, hard_targets)
        self._note_skipped_orders(builder, weights, targets, trades, equity)

        comparison = self.sandbox_service.project_comparison(
            account_id=account_id,
            start_date=as_of_date - timedelta(days=window_days),
            end_date=as_of_date,
            proposed_weights={symbol: weight for symbol, weight in targets.items() if weight > 1e-9},
            cost_method=cost_method,
        )

        builder.add_method(
            "目标权重 = 当前权重 → 上限截断（单一持仓上限）→ 防御信号调整（sell=清仓/reduce=减半）"
            "→ 止损防御减半（浮亏越过止损线）→ 超配漂移回归 30 天前基线 → 现金底仓等比压缩",
        )
        builder.add_method(
            "全部调整为只减不加：卖出释放的资金留在现金，不自动生成买入单；新进持仓无基线，不参与漂移回归",
        )
        builder.add_method(
            "交易数量 = 目标金额差额 ÷ 最新收盘价，A 股按 100 股整手向下取整（目标为 0 时清空剩余零股），其他市场不取整",
        )
        builder.add_method(
            "硬性约束（超上限/止损/清仓信号）的差额不足一手时按最小一手成交，避免违规敞口被整手规则吞掉；"
            "软性目标（漂移回归）不足一手则不下单，并在缺口中说明",
        )
        builder.add_method(
            "费用 = 金额 × 0.05%（佣金估算）；A 股卖出另计印花税 = 金额 × 0.05%，两者均为估算，不代表实际成本",
            formula="fee ≈ amount × 0.0005, tax ≈ amount × 0.0005 (A股卖出)",
        )
        builder.add_method(
            "对比图线 = 固定权重历史投影：调仓组合 vs 不调仓基线，现金收益记 0，不含费用滑点",
            formula="r_p(t) = Σ w_i × r_i(t)",
        )

        fact_cash_before = builder.add_fact("调整前现金占比", round(cash / equity * 100.0, 2), unit="%", precision=2)
        fact_cash_after = builder.add_fact("调整后现金占比", round(cash_after * 100.0, 2), unit="%", precision=2)
        adjusted = [symbol for symbol in targets if abs(targets[symbol] - weights[symbol]["weight"]) > 1e-9]
        builder.add_fact("需调整标的数", len(adjusted))
        for symbol in adjusted:
            builder.add_fact(
                f"{symbol} 目标权重",
                round(targets[symbol] * 100.0, 2),
                unit="%",
                precision=2,
            )
        builder.add_rule(
            "single_position_cap_after",
            current_value=round(max(targets.values(), default=0.0) * 100.0, 4),
            threshold=profile["single_position_cap_pct"],
            operator=">",
        )
        builder.add_rule(
            "cash_floor_after",
            current_value=round(cash_after * 100.0, 4),
            threshold=profile["cash_floor_pct"],
            operator="<",
        )
        for symbol in comparison["missing"]:
            builder.add_gap("warning", f"{symbol} 在对比窗口内无足够历史行情，已从回放中剔除")
        if comparison["critical"]:
            builder.add_gap("critical", comparison["critical"])
        builder.add_gap(
            "info",
            "调仓方案未自动执行；历史对比不代表未来收益，执行前请人工确认",
        )

        data = {
            "profile_source": profile_source,
            "window_days": window_days,
            "plan": {
                "plan_id": self._plan_signature(trades),
                "cash_before_pct": round(cash / equity * 100.0, 2),
                "cash_after_pct": round(cash_after * 100.0, 2),
                "targets": [
                    {
                        "symbol": symbol,
                        "market": weights[symbol]["market"],
                        "current_weight_pct": round(weights[symbol]["weight"] * 100.0, 2),
                        "target_weight_pct": round(targets[symbol] * 100.0, 2),
                        "unrealized_pnl_pct": (
                            round(float(weights[symbol]["unrealized_pnl_pct"]), 2)
                            if weights[symbol].get("unrealized_pnl_pct") is not None
                            else None
                        ),
                        "baseline_weight_pct": (
                            round(baseline_weights[symbol] * 100.0, 2)
                            if baseline_weights is not None and symbol in baseline_weights
                            else None
                        ),
                        "reasons": reasons.get(symbol, []),
                        "signal": signals.get(symbol),
                    }
                    for symbol in sorted(weights, key=lambda s: weights[s]["weight"], reverse=True)
                ],
                "trades": trades,
            },
            "comparison": comparison["data"],
        }
        return {"pack": builder.build(), "data": data}

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def execute_plan(
        self,
        *,
        account_id: Optional[int] = None,
        window_days: int = DEFAULT_WINDOW_DAYS,
        cost_method: str = "fifo",
        expected_plan_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        plan = self.build_plan(account_id=account_id, window_days=window_days, cost_method=cost_method)
        trades = plan["data"]["plan"]["trades"]
        if expected_plan_id and expected_plan_id != plan["data"]["plan"]["plan_id"]:
            raise PlanStaleError(
                f"调仓方案已变化（展示 {expected_plan_id}，重新计算 {plan['data']['plan']['plan_id']}），请刷新后重新确认"
            )
        resolved_account = plan["pack"]["account_id"]
        executed: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []
        trade_date = date.today()
        for trade in trades:
            trade_uid = f"ai-rebalance-{trade_date.isoformat()}-{trade['symbol']}-{trade['side']}"
            try:
                result = self.portfolio_service.record_trade(
                    account_id=resolved_account,
                    symbol=trade["symbol"],
                    trade_date=trade_date,
                    side=trade["side"],
                    quantity=trade["quantity"],
                    price=trade["price"],
                    fee=trade["estimated_fee"],
                    tax=trade.get("estimated_tax") or 0.0,
                    market=trade["market"],
                    trade_uid=trade_uid,
                    note="AI 调仓方案执行",
                )
                executed.append({"symbol": trade["symbol"], "side": trade["side"], **result})
            except PortfolioConflictError:
                skipped.append({"symbol": trade["symbol"], "side": trade["side"], "reason": "duplicate"})
            except (PortfolioOversellError, PortfolioBusyError, ValueError) as exc:
                skipped.append({"symbol": trade["symbol"], "side": trade["side"], "reason": str(exc)})
        return {"executed": executed, "skipped": skipped, "plan": plan["data"]["plan"]}

    # ------------------------------------------------------------------
    # Helpers
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

    def _load_profile(self) -> Tuple[Dict[str, float], str]:
        try:
            row = self.insights_repo.get_profile("default")
        except Exception:  # noqa: BLE001
            row = None
        if row:
            return {key: float(row[key]) for key in DEFAULT_PROFILE}, "investor_profile"
        merged = dict(DEFAULT_PROFILE)
        merged["single_position_cap_pct"] = float(
            getattr(self.config, "portfolio_risk_concentration_alert_pct", 35.0)
        )
        return merged, "global_config"

    @staticmethod
    def _note_skipped_orders(
        builder: EvidencePackBuilder,
        weights: Dict[str, Dict[str, Any]],
        targets: Dict[str, float],
        trades: List[Dict[str, Any]],
        equity: float,
    ) -> None:
        """Explain targets that produced no order (sub-lot or below min value)."""
        traded = {trade["symbol"] for trade in trades}
        for symbol, info in weights.items():
            if symbol in traded:
                continue
            delta_value = (targets.get(symbol, info["weight"]) - info["weight"]) * equity
            if abs(delta_value) < MIN_TRADE_VALUE or info["last_price"] <= 0:
                continue
            shares = abs(delta_value) / info["last_price"]
            lot = PortfolioRebalanceService._lot_size(info["market"])
            if lot > 1 and shares < lot:
                builder.add_gap(
                    "info",
                    f"{symbol} 需调整约 {shares:.0f} 股，不足一手（{lot} 股）且非硬性约束，未生成订单",
                )
            else:
                builder.add_gap("info", f"{symbol} 目标权重与当前差异过小，未生成订单")

    def _baseline_weights(
        self,
        account_id: int,
        as_of_date: date,
        cost_method: str,
    ) -> Optional[Dict[str, float]]:
        """Weights from the drift-lookback snapshot; None when unavailable."""
        try:
            snapshot = self.portfolio_service.get_portfolio_snapshot(
                account_id=account_id,
                as_of=as_of_date - timedelta(days=DRIFT_LOOKBACK_DAYS),
                cost_method=cost_method,
                include_realtime=False,
            )
        except Exception as exc:  # noqa: BLE001 - drift rule is advisory
            logger.warning("Rebalance baseline snapshot failed: %s", exc)
            return None
        account = next(
            (
                entry
                for entry in snapshot.get("accounts", [])
                if int(entry["account_id"]) == int(account_id)
            ),
            None,
        )
        if account is None:
            return None
        baseline_equity = float(account.get("total_equity") or 0.0)
        if baseline_equity <= 0:
            return None
        return {
            position["symbol"]: float(position.get("market_value_base") or 0.0) / baseline_equity
            for position in account.get("positions", [])
        }

    def _active_defensive_signals(
        self,
        weights: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Dict[str, Any]]:
        identities = sorted(
            {(info["market"], info["signal_code"]) for info in weights.values()}
        )
        if not identities:
            return {}
        latest_by_symbol: Dict[str, Dict[str, Any]] = {}
        page = 1
        while True:
            try:
                response = self.decision_signal_service.list_signals(
                    stock_identities=identities,
                    status="active",
                    page=page,
                    page_size=100,
                )
            except Exception as exc:  # noqa: BLE001 - signals are advisory
                logger.warning("Rebalance signal lookup failed: %s", exc)
                return {}
            items = response.get("items", []) if isinstance(response, dict) else []
            for item in items:
                action = str(item.get("action") or "").strip().lower()
                if action not in DEFENSIVE_ACTIONS:
                    continue
                code = str(item.get("stock_code") or "").strip()
                symbol = next(
                    (
                        s
                        for s, info in weights.items()
                        if info["signal_code"] == code
                    ),
                    None,
                )
                if symbol is None or symbol in latest_by_symbol:
                    continue
                latest_by_symbol[symbol] = {
                    "id": item.get("id"),
                    "action": action,
                    "stock_code": code,
                }
            total = int(response.get("total", 0) or 0) if isinstance(response, dict) else 0
            if page * 100 >= total or not items:
                break
            page += 1
        return latest_by_symbol

    @staticmethod
    def _lot_size(market: str) -> int:
        """A-share orders are placed in board lots; other markets are free-form."""
        return LOT_SIZE_CN if str(market or "").strip().lower() == "cn" else 1

    @staticmethod
    def _plan_signature(trades: List[Dict[str, Any]]) -> str:
        payload = "|".join(
            f"{trade['symbol']}:{trade['side']}:{float(trade['quantity']):.4f}:{float(trade['price']):.4f}"
            for trade in trades
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _build_trades(
        weights: Dict[str, Dict[str, Any]],
        targets: Dict[str, float],
        equity: float,
        hard_targets: Optional[Dict[str, bool]] = None,
    ) -> List[Dict[str, Any]]:
        """Translate weight deltas into orders.

        `hard_targets` marks symbols whose target clears a hard constraint
        (position cap, stop-loss, defensive sell). For those, a sub-lot delta is
        still executed as the smallest tradable lot — otherwise a breach would
        be left untouched. Soft targets (drift regression) simply skip the order.
        """
        hard_targets = hard_targets or {}
        trades: List[Dict[str, Any]] = []
        for symbol, info in weights.items():
            target_value = targets.get(symbol, info["weight"]) * equity
            delta = target_value - info["market_value"]
            if abs(delta) < MIN_TRADE_VALUE or info["last_price"] <= 0:
                continue
            side = "buy" if delta > 0 else "sell"
            lot = PortfolioRebalanceService._lot_size(info["market"])
            raw_quantity = abs(delta) / info["last_price"]
            quantity = math.floor(raw_quantity / lot) * lot if lot > 1 else round(raw_quantity, 2)
            lot_rounded = False
            if side == "sell":
                quantity = min(quantity, info["quantity"])
                if quantity <= 0 and hard_targets.get(symbol) and lot > 1:
                    quantity = min(lot, info["quantity"])
                    lot_rounded = True
                # Clear out sub-lot leftovers when the plan targets zero exposure.
                if targets.get(symbol, 1.0) <= 1e-9 and quantity < info["quantity"]:
                    quantity = info["quantity"]
                    lot_rounded = quantity % lot != 0
                if quantity <= 0 and targets.get(symbol, 1.0) <= 1e-9:
                    quantity = info["quantity"]
            if quantity <= 0:
                continue
            value = quantity * info["last_price"]
            is_cn = str(info["market"] or "").strip().lower() == "cn"
            tax = value * STAMP_DUTY_RATE if (side == "sell" and is_cn) else 0.0
            remaining_value = info["market_value"] - value if side == "sell" else info["market_value"] + value
            trades.append(
                {
                    "symbol": symbol,
                    "market": info["market"],
                    "side": side,
                    "quantity": round(quantity, 4),
                    "price": round(info["last_price"], 4),
                    "estimated_value": round(value, 2),
                    "estimated_fee": round(value * ESTIMATED_FEE_RATE, 2),
                    "estimated_tax": round(tax, 2),
                    "lot_rounded": lot_rounded,
                    "post_weight_pct": round(remaining_value / equity * 100.0, 2) if equity > 0 else None,
                }
            )
        return trades
