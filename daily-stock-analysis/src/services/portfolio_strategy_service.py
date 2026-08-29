# -*- coding: utf-8 -*-
"""Portfolio strategy service: rule-driven, fully explainable candidates.

Every candidate is produced by an explicit rule (threshold + deterministic
expected effect). No model invents targets; the AI layer only ranks and
phrases. Thresholds come from the structured investor profile first and fall
back to global config.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from src.config import Config, get_config
from src.repositories.insights_repo import DEFAULT_PROFILE, InsightsRepository
from src.repositories.portfolio_repo import PortfolioRepository
from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

ESTIMATED_FEE_RATE = 0.0005  # 0.05%, declared in the method notes
DRIFT_LOOKBACK_DAYS = 30


class PortfolioStrategyService:
    """Generate deterministic strategy candidates as an evidence pack."""

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

    def get_strategy_candidates(
        self,
        *,
        account_id: Optional[int] = None,
        owner_id: str = "default",
        cost_method: str = "fifo",
        as_of: Optional[date] = None,
    ) -> Dict[str, Any]:
        as_of_date = as_of or date.today()
        account_id, account = self._resolve_account(account_id)
        snapshot = self._account_snapshot(account_id, as_of_date, cost_method)
        if snapshot is None:
            raise ValueError("No snapshot available for the account")

        profile, profile_source = self._load_profile(owner_id)
        equity = float(snapshot.get("total_equity") or 0.0)
        cash = float(snapshot.get("total_cash") or 0.0)
        positions = snapshot.get("positions", [])
        if equity <= 0:
            raise ValueError("Account equity is not positive; cannot derive strategy candidates")

        weights = self._position_weights(positions, equity)
        cash_weight = cash / equity * 100.0

        builder = EvidencePackBuilder(pack_type="strategy", account_id=account_id, as_of=as_of_date)
        builder.add_input(
            "portfolio_snapshot(replay)",
            f"账户{('「' + account.name + '」') if account else ''}当前快照（缓存收盘价）",
            stale=True,
        )
        builder.add_input(
            "portfolio_investor_profile",
            f"投资者画像阈值（来源：{'个人画像' if profile_source == 'investor_profile' else '系统默认'}）",
        )
        builder.add_method(
            "候选建议全部由显式规则触发：阈值来自投资者画像，预期效果为确定性算术估算",
        )
        builder.add_method(
            "调仓费用估算 = 换手金额 × 0.05%（固定估算费率，不代表实际成本）",
            formula="fee ≈ turnover × 0.0005",
        )

        fact_equity = builder.add_fact("当前净值", round(equity, 2), unit="元", precision=2)
        fact_cash_weight = builder.add_fact("现金占比", round(cash_weight, 2), unit="%", precision=2)
        top_symbol, top_weight = self._top_weight(weights)
        fact_top = None
        if top_symbol is not None:
            fact_top = builder.add_fact(
                f"最大单一持仓 {top_symbol} 权重",
                round(top_weight, 2),
                unit="%",
                precision=2,
            )

        candidates: List[Dict[str, Any]] = []
        self._rule_concentration(builder, candidates, weights=weights, profile=profile, equity=equity, fact_top=fact_top)
        self._rule_cash_floor(builder, candidates, cash_weight=cash_weight, profile=profile, equity=equity, fact_cash=fact_cash_weight)
        self._rule_stop_loss(builder, candidates, positions=positions, profile=profile, equity=equity)
        self._rule_drift(
            builder,
            candidates,
            account_id=account_id,
            as_of_date=as_of_date,
            cost_method=cost_method,
            weights_now=weights,
            equity=equity,
            profile=profile,
        )

        triggered = builder.triggered_rules()
        if not triggered:
            builder.add_gap("info", "所有规则检查通过，当前无强制触发的候选建议")

        return {
            "pack": builder.build(),
            "data": {
                "candidates": candidates,
                "profile_source": profile_source,
            },
        }

    # ------------------------------------------------------------------
    # Inputs
    # ------------------------------------------------------------------

    def _resolve_account(self, account_id: Optional[int]) -> tuple[Optional[int], Any]:
        if account_id is not None:
            account = self.repo.get_account(int(account_id))
            if account is None:
                raise ValueError(f"Account {account_id} not found")
            return int(account_id), account
        accounts = self.repo.list_accounts(include_inactive=False)
        if not accounts:
            raise ValueError("No active portfolio account found")
        return int(accounts[0].id), accounts[0]

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

    def _load_profile(self, owner_id: str) -> tuple[Dict[str, float], str]:
        try:
            row = self.insights_repo.get_profile(owner_id)
        except Exception:  # noqa: BLE001 - fall back to defaults
            row = None
        if row:
            return {key: float(row[key]) for key in DEFAULT_PROFILE}, "investor_profile"
        config_defaults = {
            "single_position_cap_pct": float(getattr(self.config, "portfolio_risk_concentration_alert_pct", 35.0)),
            "stop_loss_pct": float(getattr(self.config, "portfolio_risk_stop_loss_alert_pct", 10.0)),
        }
        merged = dict(DEFAULT_PROFILE)
        merged.update(config_defaults)
        return merged, "global_config"

    @staticmethod
    def _position_weights(positions: List[Dict[str, Any]], equity: float) -> Dict[str, Dict[str, Any]]:
        weights: Dict[str, Dict[str, Any]] = {}
        for position in positions:
            market_value = float(position.get("market_value_base") or 0.0)
            weights[position["symbol"]] = {
                "market": position.get("market", ""),
                "name": position.get("name", ""),
                "market_value": market_value,
                "weight_pct": market_value / equity * 100.0,
                "unrealized_pnl_pct": position.get("unrealized_pnl_pct"),
                "last_price": float(position.get("last_price") or 0.0),
                "avg_cost": float(position.get("avg_cost") or 0.0),
                "quantity": float(position.get("quantity") or 0.0),
            }
        return weights

    @staticmethod
    def _top_weight(weights: Dict[str, Dict[str, Any]]) -> tuple[Optional[str], float]:
        if not weights:
            return None, 0.0
        symbol = max(weights, key=lambda key: weights[key]["weight_pct"])
        return symbol, weights[symbol]["weight_pct"]

    # ------------------------------------------------------------------
    # Rules
    # ------------------------------------------------------------------

    def _rule_concentration(
        self,
        builder: EvidencePackBuilder,
        candidates: List[Dict[str, Any]],
        *,
        weights: Dict[str, Dict[str, Any]],
        profile: Dict[str, float],
        equity: float,
        fact_top: Optional[str],
    ) -> None:
        cap = profile["single_position_cap_pct"]
        for symbol, info in sorted(weights.items(), key=lambda kv: kv[1]["weight_pct"], reverse=True):
            rule_id = builder.add_rule(
                "single_position_cap",
                current_value=round(info["weight_pct"], 4),
                threshold=cap,
                operator=">",
                related_fact_ids=[fact_top] if fact_top else [],
            )
            if not info["weight_pct"] > cap:
                continue
            target_value = cap / 100.0 * equity
            turnover = info["market_value"] - target_value
            candidates.append(
                {
                    "candidate_id": f"CAND-{len(candidates) + 1}",
                    "rule_name": "single_position_cap",
                    "rule_id": rule_id,
                    "action": "reduce",
                    "target_symbol": symbol,
                    "target_name": info.get("name", ""),
                    "trigger_rule": f"{symbol} 权重 {info['weight_pct']:.1f}% 超过单一持仓上限 {cap:.1f}%",
                    "current_value": round(info["weight_pct"], 2),
                    "threshold": cap,
                    "rationale": (
                        f"将 {symbol} 权重从 {info['weight_pct']:.1f}% 降至上限 {cap:.1f}%，"
                        f"约需减持 {turnover:,.0f} 元"
                    ),
                    "expected_effect": {
                        "post_metric_label": f"{symbol} 调整后权重",
                        "post_metric_value": cap,
                        "estimated_turnover": round(turnover, 2),
                        "estimated_fee": round(turnover * ESTIMATED_FEE_RATE, 2),
                    },
                    "related_fact_ids": [fact_top] if fact_top else [],
                }
            )

    def _rule_cash_floor(
        self,
        builder: EvidencePackBuilder,
        candidates: List[Dict[str, Any]],
        *,
        cash_weight: float,
        profile: Dict[str, float],
        equity: float,
        fact_cash: Optional[str],
    ) -> None:
        floor = profile["cash_floor_pct"]
        rule_id = builder.add_rule(
            "cash_floor",
            current_value=round(cash_weight, 4),
            threshold=floor,
            operator="<",
            related_fact_ids=[fact_cash] if fact_cash else [],
        )
        if cash_weight >= floor:
            return
        needed = (floor - cash_weight) / 100.0 * equity
        candidates.append(
            {
                "candidate_id": f"CAND-{len(candidates) + 1}",
                "rule_name": "cash_floor",
                "rule_id": rule_id,
                "action": "reduce",
                "target_symbol": None,
                "target_name": "",
                "trigger_rule": f"现金占比 {cash_weight:.1f}% 低于现金底仓 {floor:.1f}%",
                "current_value": round(cash_weight, 2),
                "threshold": floor,
                "rationale": f"补足现金底仓约需减持 {needed:,.0f} 元（可按权重比例分散减持）",
                "expected_effect": {
                    "post_metric_label": "调整后现金占比",
                    "post_metric_value": floor,
                    "estimated_turnover": round(needed, 2),
                    "estimated_fee": round(needed * ESTIMATED_FEE_RATE, 2),
                },
                "related_fact_ids": [fact_cash] if fact_cash else [],
            }
        )

    def _rule_stop_loss(
        self,
        builder: EvidencePackBuilder,
        candidates: List[Dict[str, Any]],
        *,
        positions: List[Dict[str, Any]],
        profile: Dict[str, float],
        equity: float,
    ) -> None:
        stop_loss_pct = profile["stop_loss_pct"]
        for position in positions:
            pnl_pct = position.get("unrealized_pnl_pct")
            if pnl_pct is None:
                continue
            rule_id = builder.add_rule(
                "stop_loss",
                current_value=round(float(pnl_pct), 4),
                threshold=-stop_loss_pct,
                operator="<",
            )
            if float(pnl_pct) >= -stop_loss_pct:
                continue
            market_value = float(position.get("market_value_base") or 0.0)
            candidates.append(
                {
                    "candidate_id": f"CAND-{len(candidates) + 1}",
                    "rule_name": "stop_loss",
                    "rule_id": rule_id,
                    "action": "review",
                    "target_symbol": position.get("symbol"),
                    "target_name": position.get("name", ""),
                    "trigger_rule": f"{position.get('symbol')} 浮亏 {float(pnl_pct):.1f}% 触及止损线 -{stop_loss_pct:.1f}%",
                    "current_value": round(float(pnl_pct), 2),
                    "threshold": -stop_loss_pct,
                    "rationale": (
                        f"{position.get('symbol')} 浮亏已达止损阈值，建议复核持仓逻辑；"
                        f"若全部止损将释放约 {market_value:,.0f} 元"
                    ),
                    "expected_effect": {
                        "post_metric_label": "全部止损后释放现金",
                        "post_metric_value": round(market_value, 2),
                        "estimated_turnover": round(market_value, 2),
                        "estimated_fee": round(market_value * ESTIMATED_FEE_RATE, 2),
                    },
                    "related_fact_ids": [],
                }
            )

    def _rule_drift(
        self,
        builder: EvidencePackBuilder,
        candidates: List[Dict[str, Any]],
        *,
        account_id: Optional[int],
        as_of_date: date,
        cost_method: str,
        weights_now: Dict[str, Dict[str, Any]],
        equity: float,
        profile: Dict[str, float],
    ) -> None:
        baseline_snapshot = self._account_snapshot(account_id, as_of_date - timedelta(days=DRIFT_LOOKBACK_DAYS), cost_method)
        if baseline_snapshot is None or float(baseline_snapshot.get("total_equity") or 0.0) <= 0:
            builder.add_gap("info", f"{DRIFT_LOOKBACK_DAYS} 天前无有效快照，跳过漂移再平衡检查")
            return
        baseline_equity = float(baseline_snapshot.get("total_equity"))
        baseline_weights = {
            position["symbol"]: float(position.get("market_value_base") or 0.0) / baseline_equity * 100.0
            for position in baseline_snapshot.get("positions", [])
        }
        threshold = profile["rebalance_threshold_pct"]
        for symbol in sorted(set(weights_now) | set(baseline_weights)):
            now_pct = weights_now.get(symbol, {}).get("weight_pct", 0.0)
            base_pct = baseline_weights.get(symbol, 0.0)
            drift = now_pct - base_pct
            rule_id = builder.add_rule(
                "weight_drift",
                current_value=round(abs(drift), 4),
                threshold=threshold,
                operator=">",
            )
            if abs(drift) <= threshold:
                continue
            target_value = base_pct / 100.0 * equity
            current_value = weights_now.get(symbol, {}).get("market_value", 0.0)
            turnover = abs(current_value - target_value)
            action = "reduce" if drift > 0 else "add"
            candidates.append(
                {
                    "candidate_id": f"CAND-{len(candidates) + 1}",
                    "rule_name": "weight_drift",
                    "rule_id": rule_id,
                    "action": action,
                    "target_symbol": symbol,
                    "target_name": weights_now.get(symbol, {}).get("name", ""),
                    "trigger_rule": (
                        f"{symbol} 权重较 {DRIFT_LOOKBACK_DAYS} 天前漂移 {drift:+.1f}pp，超过再平衡阈值 ±{threshold:.1f}pp"
                    ),
                    "current_value": round(now_pct, 2),
                    "threshold": round(base_pct, 2),
                    "rationale": (
                        f"{symbol} 当前权重 {now_pct:.1f}%，{DRIFT_LOOKBACK_DAYS} 天前为 {base_pct:.1f}%，"
                        f"{'减持' if drift > 0 else '增持'}约 {turnover:,.0f} 元可回到原权重"
                    ),
                    "expected_effect": {
                        "post_metric_label": f"{symbol} 回到 {DRIFT_LOOKBACK_DAYS} 天前权重",
                        "post_metric_value": round(base_pct, 2),
                        "estimated_turnover": round(turnover, 2),
                        "estimated_fee": round(turnover * ESTIMATED_FEE_RATE, 2),
                    },
                    "related_fact_ids": [],
                }
            )
