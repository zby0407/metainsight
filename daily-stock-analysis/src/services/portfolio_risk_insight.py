# -*- coding: utf-8 -*-
"""Risk insight service: wrap the deterministic risk report in an EvidencePack."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, Optional

from src.services.evidence_pack_builder import EvidencePackBuilder
from src.services.portfolio_risk_service import PortfolioRiskService

logger = logging.getLogger(__name__)


class PortfolioRiskInsightService:
    """Expose the existing risk report as citable evidence."""

    def __init__(self, *, risk_service: Optional[PortfolioRiskService] = None):
        self.risk_service = risk_service or PortfolioRiskService()

    def get_risk_insight(
        self,
        *,
        account_id: Optional[int] = None,
        as_of: Optional[date] = None,
        cost_method: str = "fifo",
    ) -> Dict[str, Any]:
        as_of_date = as_of or date.today()
        report = self.risk_service.get_risk_report(
            account_id=account_id,
            as_of=as_of_date,
            cost_method=cost_method,
            include_realtime=False,
        )

        thresholds = report.get("thresholds", {}) or {}
        concentration = report.get("concentration", {}) or {}
        sector = report.get("sector_concentration", {}) or {}
        drawdown = report.get("drawdown", {}) or {}
        stop_loss = report.get("stop_loss", {}) or {}

        builder = EvidencePackBuilder(pack_type="risk", account_id=account_id, as_of=as_of_date)
        builder.add_input(
            "portfolio_risk_service",
            "风险诊断：快照重放 + 缓存收盘价计算的集中度/回撤/止损指标",
            stale=True,
        )
        builder.add_input(
            "config_thresholds",
            "阈值来源：全局配置（可被投资者画像覆盖）",
        )
        builder.add_method("集中度 = 单一持仓市值 / 总市值；回撤基于每日净值序列峰谷计算")

        top_weight = concentration.get("top_weight_pct")
        if isinstance(top_weight, (int, float)):
            fact_top = builder.add_fact(
                "最大单一持仓权重",
                round(float(top_weight), 2),
                unit="%",
                precision=2,
            )
            builder.add_rule(
                "single_position_concentration",
                current_value=float(top_weight),
                threshold=float(thresholds.get("concentration_alert_pct", 35.0)),
                operator=">",
                related_fact_ids=[fact_top],
            )
        sector_weight = sector.get("top_weight_pct")
        if isinstance(sector_weight, (int, float)):
            fact_sector = builder.add_fact(
                "最大行业集中度",
                round(float(sector_weight), 2),
                unit="%",
                precision=2,
            )
            builder.add_rule(
                "sector_concentration",
                current_value=float(sector_weight),
                threshold=float(thresholds.get("concentration_alert_pct", 35.0)),
                operator=">",
                related_fact_ids=[fact_sector],
            )
        max_dd = drawdown.get("max_drawdown_pct")
        if isinstance(max_dd, (int, float)):
            fact_dd = builder.add_fact(
                "最大回撤",
                round(float(max_dd), 2),
                unit="%",
                precision=2,
            )
            builder.add_rule(
                "max_drawdown",
                current_value=float(max_dd),
                threshold=float(thresholds.get("drawdown_alert_pct", 15.0)),
                operator=">",
                related_fact_ids=[fact_dd],
            )
        current_dd = drawdown.get("current_drawdown_pct")
        if isinstance(current_dd, (int, float)):
            builder.add_fact("当前回撤", round(float(current_dd), 2), unit="%", precision=2)
        triggered = int(stop_loss.get("triggered_count") or 0)
        near = int(stop_loss.get("near_count") or 0)
        builder.add_fact("触发止损持仓数", triggered)
        builder.add_fact("接近止损持仓数", near)
        builder.add_rule(
            "stop_loss_triggered_count",
            current_value=float(triggered),
            threshold=0.0,
            operator=">",
        )

        triggered_rules = builder.triggered_rules()
        if not triggered_rules:
            builder.add_gap("info", "所有风险规则检查通过，当前无需立即处理的风险项")

        return {"pack": builder.build(), "data": report}
