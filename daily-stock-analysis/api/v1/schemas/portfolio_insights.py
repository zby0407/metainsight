# -*- coding: utf-8 -*-
"""Schemas for the explainable portfolio insight pipeline.

All four insight features (review / risk / strategy / sandbox) share the
EvidencePack contract. Each compute endpoint returns `{pack, data}`: the pack
carries cited, deterministic evidence; the data block carries typed tables
for direct rendering.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

PackType = Literal["review", "risk", "strategy", "sandbox"]


# ----------------------------------------------------------------------
# EvidencePack contract
# ----------------------------------------------------------------------

class EvidenceFact(BaseModel):
    id: str
    label: str
    value: Optional[Any] = None
    unit: Optional[str] = None
    precision: Optional[int] = None
    source_fact_ids: List[str] = Field(default_factory=list)


class EvidenceInput(BaseModel):
    id: str
    source: str
    description: str
    date_range: Optional[List[str]] = None
    row_count: Optional[int] = None
    stale: bool = False


class EvidenceMethod(BaseModel):
    id: str
    description: str
    formula: Optional[str] = None


class EvidenceRule(BaseModel):
    id: str
    rule_name: str
    current_value: float
    threshold: float
    operator: str
    triggered: bool
    related_fact_ids: List[str] = Field(default_factory=list)


class EvidenceGap(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    description: str
    affected_fact_ids: List[str] = Field(default_factory=list)


class EvidencePackResponse(BaseModel):
    pack_id: str
    pack_type: PackType
    account_id: Optional[int] = None
    as_of: str
    generated_at: str
    facts: List[EvidenceFact] = Field(default_factory=list)
    inputs: List[EvidenceInput] = Field(default_factory=list)
    method: List[EvidenceMethod] = Field(default_factory=list)
    rules: List[EvidenceRule] = Field(default_factory=list)
    gaps: List[EvidenceGap] = Field(default_factory=list)


# ----------------------------------------------------------------------
# Performance
# ----------------------------------------------------------------------

class EquitySeriesPoint(BaseModel):
    date: str
    equity: float
    cash: Optional[float] = None
    market_value: Optional[float] = None


class PerformanceMetrics(BaseModel):
    period_return_pct: Optional[float] = None
    annualized_return_pct: Optional[float] = None
    annualized_volatility_pct: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    trading_days: int = 0
    risk_free_rate_pct: float = 0.0


class DailyPnlPoint(BaseModel):
    date: str
    equity: float
    pnl: float
    pnl_pct: Optional[float] = None


class PortfolioDailyPnlResponse(BaseModel):
    series: List[DailyPnlPoint] = Field(default_factory=list)
    account_count: int = 0


class PortfolioPerformanceData(BaseModel):
    series: List[EquitySeriesPoint] = Field(default_factory=list)
    metrics: PerformanceMetrics = Field(default_factory=PerformanceMetrics)


class PortfolioPerformanceResponse(BaseModel):
    pack: EvidencePackResponse
    data: PortfolioPerformanceData


# ----------------------------------------------------------------------
# Review (attribution)
# ----------------------------------------------------------------------

class AttributionItem(BaseModel):
    symbol: str
    name: str = ""
    market: str = ""
    quantity_start: float = 0.0
    quantity_end: float = 0.0
    weight_start_pct: Optional[float] = None
    weight_end_pct: Optional[float] = None
    holding_contribution: float = 0.0
    trade_contribution: float = 0.0
    contribution: float = 0.0
    contribution_pct: Optional[float] = None
    fact_id: Optional[str] = None


class ReviewTradeItem(BaseModel):
    trade_date: str
    symbol: str
    side: str
    quantity: float
    price: float
    fee: float = 0.0
    tax: float = 0.0
    note: Optional[str] = None


class ReviewReconciliation(BaseModel):
    parts_total: float
    expected_total: float
    difference: float
    tolerance: float
    reconciled: bool


class ReviewCashFlowItem(BaseModel):
    event_date: str
    direction: str
    amount: float


class PortfolioReviewData(BaseModel):
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    period_return_pct: Optional[float] = None
    equity_start: Optional[float] = None
    equity_end: Optional[float] = None
    net_cash_flow: float = 0.0
    cash_flows: List[ReviewCashFlowItem] = Field(default_factory=list)
    attribution: List[AttributionItem] = Field(default_factory=list)
    cash_drag: float = 0.0
    trades: List[ReviewTradeItem] = Field(default_factory=list)
    reconciliation: Optional[ReviewReconciliation] = None


class PortfolioReviewResponse(BaseModel):
    pack: EvidencePackResponse
    data: PortfolioReviewData


# ----------------------------------------------------------------------
# Risk
# ----------------------------------------------------------------------

class PortfolioRiskInsightResponse(BaseModel):
    pack: EvidencePackResponse
    data: Dict[str, Any] = Field(default_factory=dict)


# ----------------------------------------------------------------------
# Strategy candidates
# ----------------------------------------------------------------------

class StrategyExpectedEffect(BaseModel):
    post_metric_label: str = ""
    post_metric_value: Optional[float] = None
    estimated_turnover: Optional[float] = None
    estimated_fee: Optional[float] = None


class StrategyCandidate(BaseModel):
    candidate_id: str
    rule_name: str
    rule_id: Optional[str] = None
    action: Literal["reduce", "add", "rebalance", "hold", "review"]
    target_symbol: Optional[str] = None
    target_name: str = ""
    trigger_rule: str
    current_value: Optional[float] = None
    threshold: Optional[float] = None
    rationale: str = ""
    expected_effect: Optional[StrategyExpectedEffect] = None
    related_fact_ids: List[str] = Field(default_factory=list)


class PortfolioStrategyData(BaseModel):
    candidates: List[StrategyCandidate] = Field(default_factory=list)
    profile_source: Literal["investor_profile", "global_config"] = "global_config"


class PortfolioStrategyResponse(BaseModel):
    pack: EvidencePackResponse
    data: PortfolioStrategyData


# ----------------------------------------------------------------------
# Sandbox
# ----------------------------------------------------------------------

class SandboxWeightAdjustment(BaseModel):
    symbol: str
    delta_weight_pct: float = Field(..., description="Weight change in percentage points, e.g. -10 means reduce 10pp")


class SandboxWhatIfRequest(BaseModel):
    account_id: Optional[int] = None
    adjustments: List[SandboxWeightAdjustment] = Field(default_factory=list)
    cost_method: str = "fifo"


class SandboxPositionEffect(BaseModel):
    symbol: str
    name: str = ""
    weight_before_pct: float
    weight_after_pct: float


class SandboxWhatIfData(BaseModel):
    total_equity: Optional[float] = None
    positions: List[SandboxPositionEffect] = Field(default_factory=list)
    max_position_weight_before_pct: Optional[float] = None
    max_position_weight_after_pct: Optional[float] = None
    cash_weight_before_pct: Optional[float] = None
    cash_weight_after_pct: Optional[float] = None
    positions_after: List[Dict[str, Any]] = Field(default_factory=list)


class SandboxWhatIfResponse(BaseModel):
    pack: EvidencePackResponse
    data: SandboxWhatIfData


class SandboxScenarioRequest(BaseModel):
    account_id: Optional[int] = None
    start_date: str = Field(..., description="ISO date, inclusive")
    end_date: str = Field(..., description="ISO date, inclusive")
    proposed_weights: Dict[str, float] = Field(
        default_factory=dict,
        description="Symbol -> target weight fraction (0..1). Symbols omitted keep baseline weights.",
    )
    cost_method: str = "fifo"


class ScenarioSeriesPoint(BaseModel):
    date: str
    baseline_equity: float
    proposed_equity: Optional[float] = None


class SandboxScenarioData(BaseModel):
    start_date: str
    end_date: str
    baseline_return_pct: Optional[float] = None
    proposed_return_pct: Optional[float] = None
    baseline_max_drawdown_pct: Optional[float] = None
    proposed_max_drawdown_pct: Optional[float] = None
    series: List[ScenarioSeriesPoint] = Field(default_factory=list)
    weights_used: Dict[str, float] = Field(default_factory=dict)


class SandboxScenarioResponse(BaseModel):
    pack: EvidencePackResponse
    data: SandboxScenarioData


# ----------------------------------------------------------------------
# Investor profile
# ----------------------------------------------------------------------

class InvestorProfileResponse(BaseModel):
    owner_id: str
    cash_floor_pct: float
    single_position_cap_pct: float
    sector_cap_pct: float
    rebalance_threshold_pct: float
    stop_loss_pct: float
    source: Literal["stored", "default"] = "stored"


class InvestorProfileUpdateRequest(BaseModel):
    owner_id: str = "default"
    cash_floor_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    single_position_cap_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    sector_cap_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    rebalance_threshold_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    stop_loss_pct: Optional[float] = Field(None, ge=0.0, le=100.0)


# ----------------------------------------------------------------------
# Report persistence
# ----------------------------------------------------------------------

class InsightReportSaveRequest(BaseModel):
    pack: EvidencePackResponse
    data: Dict[str, Any] = Field(default_factory=dict)
    ai_interpretation: Optional[str] = None


class InsightReportItem(BaseModel):
    pack_id: str
    account_id: Optional[int] = None
    pack_type: PackType
    as_of: str
    created_at: str
    ai_interpretation: Optional[str] = None
    evidence_pack: Optional[EvidencePackResponse] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class InsightReportListResponse(BaseModel):
    items: List[InsightReportItem] = Field(default_factory=list)
    total: int = 0


# ----------------------------------------------------------------------
# AI rebalance plan
# ----------------------------------------------------------------------

class RebalancePlanResponse(BaseModel):
    pack: EvidencePackResponse
    data: Dict[str, Any] = Field(default_factory=dict)


class RebalanceExecuteRequest(BaseModel):
    account_id: Optional[int] = None
    window_days: int = Field(90, ge=7, le=365)
    expected_plan_id: Optional[str] = Field(
        None,
        description="Plan id shown to the user; execution aborts with 409 when the recomputed plan differs",
    )


class RebalanceExecuteResponse(BaseModel):
    executed: List[Dict[str, Any]] = Field(default_factory=list)
    skipped: List[Dict[str, Any]] = Field(default_factory=list)
    plan: Dict[str, Any] = Field(default_factory=dict)
