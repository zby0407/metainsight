"""Authenticated read projection for the native investment Agent workspace."""

from __future__ import annotations

import logging
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, status

from app.gateway.deps import get_current_user_from_request
from app.gateway.local_finance_store import (
    complete_setup as complete_local_setup,
    finance_bridge_configured,
    load_dashboard as load_local_dashboard,
)
from app.gateway.portfolio_live import apply_live_performance
from deerflow.community.finance_agent.bridge import (
    build_finance_bridge_headers,
    finance_bridge_base_url,
)
from deerflow.persistence.dsa.repository import DsaTenantRepository
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/finance", tags=["finance"])

_REQUEST_TIMEOUT_SECONDS = 20.0


async def _current_watchlist_symbols(user_id: str) -> list[str]:
    try:
        factory = get_session_factory()
        if factory is None:
            return []
        return await DsaTenantRepository(factory).list_watchlist(user_id)
    except Exception:
        logger.warning("Watchlist symbols unavailable for portfolio sync", exc_info=True)
        return []


@router.get("/portfolio-dashboard")
async def get_portfolio_dashboard(
    request: Request,
    response: Response,
) -> dict:
    """Return only the current user's portfolio workspace projection."""
    user = await get_current_user_from_request(request)
    if not finance_bridge_configured():
        response.headers["Cache-Control"] = "private, no-store"
        symbols = await _current_watchlist_symbols(str(user.id))
        dashboard = load_local_dashboard(str(user.id), watchlist_symbols=symbols)
        return await apply_live_performance(dashboard)

    request_thread_id = str(uuid4())
    try:
        headers = build_finance_bridge_headers(
            user_id=str(user.id),
            thread_id=request_thread_id,
            run_id=str(uuid4()),
        )
        bridge_url = finance_bridge_base_url()
    except (RuntimeError, ValueError) as exc:
        logger.error("Finance portfolio dashboard is not configured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Investment portfolio service is not configured.",
        ) from exc

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            bridge_response = await client.get(
                f"{bridge_url}/agent/portfolio-dashboard",
                headers=headers,
            )
        payload = bridge_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "Finance portfolio dashboard is unavailable (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service is unavailable.",
        ) from exc

    if bridge_response.is_error:
        logger.warning(
            "Finance portfolio dashboard bridge returned HTTP %s",
            bridge_response.status_code,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service rejected the read request.",
        )
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service returned an invalid response.",
        )

    response.headers["Cache-Control"] = "private, no-store"
    return payload


@router.post("/portfolio-setup", status_code=status.HTTP_201_CREATED)
async def complete_portfolio_setup(
    setup: dict,
    request: Request,
    response: Response,
) -> dict:
    """Complete the page-first setup flow under the current DeerFlow identity."""
    user = await get_current_user_from_request(request)
    if not finance_bridge_configured():
        try:
            payload = complete_local_setup(str(user.id), setup)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        response.headers["Cache-Control"] = "private, no-store"
        return payload

    try:
        headers = build_finance_bridge_headers(
            user_id=str(user.id),
            thread_id=str(uuid4()),
            run_id=str(uuid4()),
        )
        bridge_url = finance_bridge_base_url()
    except (RuntimeError, ValueError) as exc:
        logger.error("Finance portfolio setup is not configured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Investment portfolio service is not configured.",
        ) from exc

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            bridge_response = await client.post(
                f"{bridge_url}/workspace/setup",
                headers=headers,
                json=setup,
            )
        payload = bridge_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "Finance portfolio setup is unavailable (%s)",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service is unavailable.",
        ) from exc

    if bridge_response.status_code in {
        status.HTTP_409_CONFLICT,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
    }:
        detail = payload.get("detail") if isinstance(payload, dict) else None
        raise HTTPException(
            status_code=bridge_response.status_code,
            detail=detail or "Investment portfolio setup was rejected.",
        )
    if bridge_response.is_error:
        logger.warning(
            "Finance portfolio setup bridge returned HTTP %s",
            bridge_response.status_code,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service rejected the setup request.",
        )
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Investment portfolio service returned an invalid response.",
        )

    response.headers["Cache-Control"] = "private, no-store"
    return payload
