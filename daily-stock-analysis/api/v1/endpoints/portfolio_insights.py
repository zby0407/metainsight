# -*- coding: utf-8 -*-
"""Portfolio insight pipeline endpoints.

Hosts the explainable insight features (review / risk / strategy / sandbox):
deterministic compute endpoints returning EvidencePacks, investor profile
CRUD, and report persistence for the gateway AI orchestration layer.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from api.v1.errors import api_error
from api.v1.schemas.common import ErrorResponse
from api.v1.schemas.portfolio_insights import (
    InsightReportItem,
    InsightReportListResponse,
    InsightReportSaveRequest,
    InvestorProfileResponse,
    InvestorProfileUpdateRequest,
    PortfolioDailyPnlResponse,
    PortfolioPerformanceResponse,
    PortfolioReviewResponse,
    PortfolioRiskInsightResponse,
    PortfolioStrategyResponse,
    SandboxScenarioRequest,
    SandboxScenarioResponse,
    SandboxWhatIfRequest,
    SandboxWhatIfResponse,
)
from src.repositories.insights_repo import DEFAULT_PROFILE, InsightsRepository
from src.services.portfolio_performance_service import PortfolioPerformanceService
from src.services.portfolio_review_service import PortfolioReviewService
from src.services.portfolio_risk_insight import PortfolioRiskInsightService
from src.services.portfolio_sandbox_service import PortfolioSandboxService
from src.services.portfolio_strategy_service import PortfolioStrategyService

logger = logging.getLogger(__name__)

router = APIRouter()


def _internal_error(message: str, exc: Exception) -> HTTPException:
    logger.error(f"{message}: {exc}", exc_info=True)
    return api_error(500, "internal_error", f"{message}: {str(exc)}")


def _bad_request(exc: Exception) -> HTTPException:
    return api_error(400, "validation_error", str(exc))


def _parse_date(value: Optional[str], field: str) -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise api_error(400, "validation_error", f"{field} must be an ISO date (YYYY-MM-DD)")


# ----------------------------------------------------------------------
# Deterministic compute endpoints
# ----------------------------------------------------------------------

@router.get(
    "/performance",
    response_model=PortfolioPerformanceResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Portfolio equity series + performance metrics (evidence pack)",
)
def get_portfolio_performance(
    account_id: Optional[int] = Query(None, description="Account id; defaults to the first active account"),
    days: int = Query(180, ge=7, le=3650, description="Lookback window in calendar days"),
    as_of: Optional[str] = Query(None, description="ISO end date; defaults to today"),
    cost_method: str = Query("fifo", pattern="^(fifo|avg)$"),
) -> PortfolioPerformanceResponse:
    service = PortfolioPerformanceService()
    try:
        result = service.get_performance(
            account_id=account_id,
            days=days,
            as_of=_parse_date(as_of, "as_of"),
            cost_method=cost_method,
        )
        return PortfolioPerformanceResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Portfolio performance failed", exc)


@router.get(
    "/review",
    response_model=PortfolioReviewResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Period attribution review (evidence pack)",
)
def get_portfolio_review(
    account_id: Optional[int] = Query(None, description="Account id; defaults to the first active account"),
    start_date: Optional[str] = Query(None, description="ISO start date; defaults to end - 30d"),
    end_date: Optional[str] = Query(None, description="ISO end date; defaults to today"),
    cost_method: str = Query("fifo", pattern="^(fifo|avg)$"),
) -> PortfolioReviewResponse:
    service = PortfolioReviewService()
    try:
        result = service.get_review(
            account_id=account_id,
            start_date=_parse_date(start_date, "start_date"),
            end_date=_parse_date(end_date, "end_date"),
            cost_method=cost_method,
        )
        return PortfolioReviewResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Portfolio review failed", exc)


@router.get(
    "/daily-pnl",
    response_model=PortfolioDailyPnlResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Aggregated daily PnL across accounts (calendar heatmap data)",
)
def get_daily_pnl(
    days: int = Query(120, ge=30, le=3650, description="Lookback window in calendar days"),
    as_of: Optional[str] = Query(None, description="ISO end date; defaults to today"),
) -> PortfolioDailyPnlResponse:
    service = PortfolioPerformanceService()
    try:
        result = service.get_daily_pnl_series(
            days=days,
            as_of=_parse_date(as_of, "as_of"),
        )
        return PortfolioDailyPnlResponse(**result)
    except Exception as exc:
        raise _internal_error("Daily PnL series failed", exc)


@router.get(
    "/risk-insight",
    response_model=PortfolioRiskInsightResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Risk diagnosis as an evidence pack",
)
def get_risk_insight(
    account_id: Optional[int] = Query(None, description="Account id; defaults to the first active account"),
    as_of: Optional[str] = Query(None, description="ISO date; defaults to today"),
    cost_method: str = Query("fifo", pattern="^(fifo|avg)$"),
) -> PortfolioRiskInsightResponse:
    service = PortfolioRiskInsightService()
    try:
        result = service.get_risk_insight(
            account_id=account_id,
            as_of=_parse_date(as_of, "as_of"),
            cost_method=cost_method,
        )
        return PortfolioRiskInsightResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Risk insight failed", exc)


@router.get(
    "/strategy-candidates",
    response_model=PortfolioStrategyResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Rule-driven strategy candidates (evidence pack)",
)
def get_strategy_candidates(
    account_id: Optional[int] = Query(None, description="Account id; defaults to the first active account"),
    owner_id: str = Query("default", description="Investor profile owner id"),
    cost_method: str = Query("fifo", pattern="^(fifo|avg)$"),
) -> PortfolioStrategyResponse:
    service = PortfolioStrategyService()
    try:
        result = service.get_strategy_candidates(
            account_id=account_id,
            owner_id=owner_id,
            cost_method=cost_method,
        )
        return PortfolioStrategyResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Strategy candidates failed", exc)


@router.post(
    "/sandbox/what-if",
    response_model=SandboxWhatIfResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Sandbox what-if: recompute allocation metrics after weight adjustments",
)
def sandbox_what_if(request: SandboxWhatIfRequest) -> SandboxWhatIfResponse:
    service = PortfolioSandboxService()
    try:
        result = service.what_if(
            account_id=request.account_id,
            adjustments=[adjustment.model_dump() for adjustment in request.adjustments],
            cost_method=request.cost_method,
        )
        return SandboxWhatIfResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Sandbox what-if failed", exc)


@router.post(
    "/sandbox/scenario",
    response_model=SandboxScenarioResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Sandbox scenario: deterministic replay of historical daily returns",
)
def sandbox_scenario(request: SandboxScenarioRequest) -> SandboxScenarioResponse:
    service = PortfolioSandboxService()
    start = _parse_date(request.start_date, "start_date")
    end = _parse_date(request.end_date, "end_date")
    try:
        result = service.scenario(
            account_id=request.account_id,
            start_date=start,
            end_date=end,
            proposed_weights=request.proposed_weights,
            cost_method=request.cost_method,
        )
        return SandboxScenarioResponse(**result)
    except ValueError as exc:
        raise _bad_request(exc)
    except Exception as exc:
        raise _internal_error("Sandbox scenario failed", exc)


# ----------------------------------------------------------------------
# Investor profile
# ----------------------------------------------------------------------

@router.get(
    "/investor-profile",
    response_model=InvestorProfileResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Get investor risk profile (falls back to defaults)",
)
def get_investor_profile(
    owner_id: str = Query("default", description="Profile owner id"),
) -> InvestorProfileResponse:
    repo = InsightsRepository()
    try:
        row = repo.get_profile(owner_id)
        if row is None:
            return InvestorProfileResponse(owner_id=owner_id, source="default", **DEFAULT_PROFILE)
        return InvestorProfileResponse(source="stored", **row)
    except Exception as exc:
        raise _internal_error("Get investor profile failed", exc)


@router.put(
    "/investor-profile",
    response_model=InvestorProfileResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Upsert investor risk profile",
)
def update_investor_profile(request: InvestorProfileUpdateRequest) -> InvestorProfileResponse:
    repo = InsightsRepository()
    fields = request.model_dump(exclude={"owner_id"}, exclude_none=True)
    try:
        row = repo.upsert_profile(request.owner_id or "default", fields)
        return InvestorProfileResponse(source="stored", **row)
    except ValueError as exc:
        raise api_error(400, "validation_error", str(exc))
    except Exception as exc:
        raise _internal_error("Update investor profile failed", exc)


# ----------------------------------------------------------------------
# Insight report persistence
# ----------------------------------------------------------------------

@router.post(
    "/insight-reports",
    response_model=InsightReportItem,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Persist an insight report (evidence pack + AI interpretation)",
)
def save_insight_report(request: InsightReportSaveRequest) -> InsightReportItem:
    repo = InsightsRepository()
    pack = request.pack
    try:
        row = repo.save_report(
            pack_id=pack.pack_id,
            account_id=pack.account_id,
            pack_type=pack.pack_type,
            as_of=pack.as_of,
            evidence_pack=pack.model_dump(),
            ai_interpretation=request.ai_interpretation,
        )
        return InsightReportItem(**row)
    except Exception as exc:
        raise _internal_error("Save insight report failed", exc)


@router.get(
    "/insight-reports/{pack_id}",
    response_model=InsightReportItem,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    summary="Get one insight report by pack id",
)
def get_insight_report(pack_id: str) -> InsightReportItem:
    repo = InsightsRepository()
    try:
        row = repo.get_report(pack_id)
    except Exception as exc:
        raise _internal_error("Get insight report failed", exc)
    if row is None:
        raise api_error(404, "not_found", f"Insight report {pack_id} not found")
    return InsightReportItem(**row)


@router.get(
    "/insight-reports",
    response_model=InsightReportListResponse,
    responses={500: {"model": ErrorResponse}},
    summary="List insight reports",
)
def list_insight_reports(
    account_id: Optional[int] = Query(None, description="Filter by account id"),
    pack_type: Optional[str] = Query(None, description="Filter by pack type"),
    limit: int = Query(20, ge=1, le=100),
) -> InsightReportListResponse:
    repo = InsightsRepository()
    try:
        rows = repo.list_reports(account_id=account_id, pack_type=pack_type, limit=limit)
        items = [InsightReportItem(**row) for row in rows]
        return InsightReportListResponse(items=items, total=len(items))
    except Exception as exc:
        raise _internal_error("List insight reports failed", exc)
