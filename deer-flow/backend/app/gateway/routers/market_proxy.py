"""Authenticated tenant facade for the otherwise global DSA stock service.

Only immutable/public market data is proxied as shared data. Watchlists,
analysis tasks, reports, and decision signals are bound to the authenticated
MetaInsight user in the Gateway database and filtered before they leave the
process. Unknown upstream routes fail closed.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select

from app.gateway.deps import get_current_user_from_request
from app.gateway.local_finance_store import try_sync_watchlist_portfolio
from deerflow.persistence.dsa.repository import DsaTenantRepository
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.user.model import UserRow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["market"])

_SYMBOL_RE = re.compile(r"^[A-Z0-9.]{1,32}$")
_SHARED_STOCK_PATH_RE = re.compile(r"^stocks/[^/]+/(?:quote|history)$")
_HISTORY_DETAIL_RE = re.compile(r"^history/([^/]+)(?:/(diagnostics|flow|markdown|news))?$")
_TASK_PATH_RE = re.compile(r"^analysis/(?:status/([^/]+)|tasks/([^/]+)/flow)$")
_SIGNAL_DETAIL_RE = re.compile(r"^decision-signals/(\d+)(?:/(feedback|outcomes|status))?$")

_UPSTREAM_TIMEOUT = httpx.Timeout(600.0, connect=10.0)
_RESPONSE_HEADERS = {"content-type", "content-disposition", "cache-control"}


def _upstream_base_url() -> str:
    return os.getenv(
        "DSA_INTERNAL_API_URL",
        "http://stock-server:8000/api/v1",
    ).rstrip("/")


def _repo() -> DsaTenantRepository:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(status_code=503, detail="Market tenant storage is unavailable")
    return DsaTenantRepository(session_factory)


def _normalize_symbol(value: Any) -> str:
    symbol = str(value or "").strip().upper()
    if not _SYMBOL_RE.fullmatch(symbol):
        raise HTTPException(status_code=422, detail="Invalid stock code")
    return symbol


def _is_shared_market_read(path: str, method: str) -> bool:
    """Return True only for immutable/public market-data reads."""
    if method.upper() != "GET":
        return False
    return bool(
        _SHARED_STOCK_PATH_RE.fullmatch(path)
        or path == "intelligence/items"
        or path.startswith("intelligence/items/")
        or path == "alphasift/hotspots"
        or path.startswith("alphasift/hotspots/")
        or path in {"health", "agent/models", "agent/skills"}
    )


def _filter_history_payload(payload: dict[str, Any], owned_refs: set[str]) -> dict[str, Any]:
    items = [
        item
        for item in payload.get("items", [])
        if isinstance(item, dict) and str(item.get("query_id") or "") in owned_refs
    ]
    result = dict(payload)
    result["items"] = items
    result["total"] = len(items)
    return result


def _filter_task_payload(payload: dict[str, Any], owned_refs: set[str]) -> dict[str, Any]:
    tasks = [
        item
        for item in payload.get("tasks", [])
        if isinstance(item, dict) and str(item.get("task_id") or "") in owned_refs
    ]
    result = dict(payload)
    result["tasks"] = tasks
    result["total"] = len(tasks)
    result["pending"] = sum(str(item.get("status")) == "pending" for item in tasks)
    result["processing"] = sum(str(item.get("status")) == "processing" for item in tasks)
    return result


def _filter_signal_payload(payload: dict[str, Any], owned_refs: set[str]) -> dict[str, Any]:
    items = [
        item
        for item in payload.get("items", [])
        if isinstance(item, dict) and str(item.get("trace_id") or "") in owned_refs
    ]
    result = dict(payload)
    result["items"] = items
    result["total"] = len(items)
    return result


def _extract_task_claims(
    request_payload: dict[str, Any],
    response_payload: dict[str, Any],
) -> list[tuple[str, str]]:
    """Extract (task id, stock code) ownership edges from all DSA response shapes."""
    requested_codes = [
        _normalize_symbol(value)
        for value in (
            request_payload.get("stock_codes")
            or ([request_payload.get("stock_code")] if request_payload.get("stock_code") else [])
        )
    ]
    fallback_code = requested_codes[0] if len(requested_codes) == 1 else "UNKNOWN"
    claims: list[tuple[str, str]] = []

    def add(task_id: Any, stock_code: Any = None) -> None:
        normalized_task = str(task_id or "").strip()
        if not normalized_task:
            return
        code = str(stock_code or fallback_code).strip().upper()[:32] or "UNKNOWN"
        edge = (normalized_task, code)
        if edge not in claims:
            claims.append(edge)

    add(response_payload.get("task_id"))
    add(response_payload.get("existing_task_id"))
    add(response_payload.get("query_id"))
    add(response_payload.get("trace_id"))
    result = response_payload.get("result")
    if isinstance(result, dict):
        add(result.get("query_id") or result.get("trace_id"), result.get("stock_code"))
    for key in ("accepted", "duplicates", "tasks"):
        for item in response_payload.get(key) or []:
            if isinstance(item, dict):
                add(
                    item.get("task_id") or item.get("existing_task_id") or item.get("query_id"),
                    item.get("stock_code"),
                )
    return claims


def _extract_query_id_from_task(payload: dict[str, Any]) -> str | None:
    """Return the report/query id exposed by a completed upstream task."""
    direct = payload.get("query_id") or payload.get("trace_id")
    if direct:
        return str(direct).strip() or None
    result = payload.get("result")
    if isinstance(result, dict):
        nested = result.get("query_id") or result.get("trace_id")
        if nested:
            return str(nested).strip() or None
    return None


async def _read_json_body(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Request body must be an object")
    return payload


async def _send_upstream(
    path: str,
    request: Request,
    *,
    json_body: dict[str, Any] | None = None,
    method: str | None = None,
    query: list[tuple[str, str]] | None = None,
) -> httpx.Response:
    headers: dict[str, str] = {}
    for name in ("accept", "content-type"):
        value = request.headers.get(name)
        if value:
            headers[name] = value
    kwargs: dict[str, Any] = {
        "method": method or request.method,
        "url": f"{_upstream_base_url()}/{path}",
        "params": query if query is not None else list(request.query_params.multi_items()),
        "headers": headers,
    }
    if json_body is not None:
        kwargs["json"] = json_body
    elif request.method not in {"GET", "HEAD"}:
        kwargs["content"] = await request.body()
    async with httpx.AsyncClient(timeout=_UPSTREAM_TIMEOUT) as client:
        try:
            return await client.request(**kwargs)
        except httpx.HTTPError as exc:
            logger.warning("DSA upstream request failed path=%s error=%s", path, type(exc).__name__)
            raise HTTPException(status_code=502, detail="Market research service is unavailable") from exc


def _forward_response(response: httpx.Response) -> Response:
    headers = {
        name: value
        for name, value in response.headers.items()
        if name.lower() in _RESPONSE_HEADERS
    }
    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=headers,
    )


def _upstream_json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Market research service returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Market research service returned an invalid response")
    return payload


async def _ensure_legacy_admin_import(request: Request, user_id: str, is_admin: bool) -> None:
    """Assign pre-isolation global state to the first administrator exactly once."""
    if not is_admin:
        return
    session_factory = get_session_factory()
    if session_factory is None:
        return
    async with session_factory() as session:
        primary_admin_id = await session.scalar(
            select(UserRow.id)
            .where(UserRow.system_role == "admin")
            .order_by(UserRow.created_at, UserRow.id)
            .limit(1)
        )
    if str(primary_admin_id or "") != user_id:
        return
    repo = _repo()
    if await repo.legacy_import_owner() is not None:
        return
    try:
        watchlist_response = await _send_upstream("stocks/watchlist", request, method="GET", query=[])
        tasks_response = await _send_upstream("analysis/tasks", request, method="GET", query=[("limit", "100")])
        watchlist_response.raise_for_status()
        tasks_response.raise_for_status()
        watchlist_payload = _upstream_json(watchlist_response)
        tasks_payload = _upstream_json(tasks_response)
        symbols = [
            _normalize_symbol(symbol)
            for symbol in watchlist_payload.get("stock_codes", [])
        ]
        await repo.replace_watchlist(user_id, symbols)
        try_sync_watchlist_portfolio(user_id, symbols)
        for task in tasks_payload.get("tasks", []):
            if not isinstance(task, dict):
                continue
            await repo.claim_task(
                user_id,
                str(task.get("task_id") or ""),
                str(task.get("stock_code") or "UNKNOWN"),
                stock_name=str(task.get("stock_name")) if task.get("stock_name") else None,
            )
        await repo.mark_legacy_imported(user_id)
        logger.info(
            "Imported legacy DSA state for admin user=%s symbols=%d tasks=%d",
            user_id,
            len(symbols),
            len(tasks_payload.get("tasks", [])),
        )
    except (HTTPException, httpx.HTTPError, ValueError, TypeError):
        logger.warning("Legacy DSA import deferred because upstream data was unavailable", exc_info=True)


async def _authorize_history(
    record_id: str,
    request: Request,
    user_id: str,
) -> httpx.Response:
    response = await _send_upstream(f"history/{record_id}", request, method="GET", query=[])
    if response.status_code >= 400:
        return response
    payload = _upstream_json(response)
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    if meta.get("report_type") == "market_review":
        return response
    query_id = str(meta.get("query_id") or "")
    if not query_id or not await _repo().owns_task_ref(user_id, query_id):
        raise HTTPException(status_code=404, detail="Research report not found")
    return response


async def _authorize_signal(signal_id: str, request: Request, user_id: str) -> httpx.Response:
    response = await _send_upstream(f"decision-signals/{signal_id}", request, method="GET", query=[])
    if response.status_code >= 400:
        return response
    payload = _upstream_json(response)
    trace_id = str(payload.get("trace_id") or "")
    if not trace_id or not await _repo().owns_task_ref(user_id, trace_id):
        raise HTTPException(status_code=404, detail="Decision signal not found")
    return response


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    # A wildcard facade intentionally represents several upstream operations.
    # Publishing it as one OpenAPI operation would assign the same operationId
    # to every HTTP method, so keep the internal transport out of generated SDKs.
    include_in_schema=False,
)
async def tenant_market_proxy(path: str, request: Request) -> Response:
    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    is_admin = getattr(user, "system_role", None) == "admin"
    normalized_path = path.strip("/")
    method = request.method.upper()

    if _is_shared_market_read(normalized_path, method):
        return _forward_response(await _send_upstream(normalized_path, request))

    if normalized_path in {"stocks/parse-import", "stocks/extract-from-image"} and method == "POST":
        return _forward_response(await _send_upstream(normalized_path, request))

    private_root = normalized_path.split("/", 1)[0]
    if private_root in {"stocks", "analysis", "history", "decision-signals"}:
        await _ensure_legacy_admin_import(request, user_id, is_admin)

    repo = _repo()

    if normalized_path == "stocks/watchlist" and method == "GET":
        symbols = await repo.list_watchlist(user_id)
        return JSONResponse(
            {"stock_codes": symbols, "message": f"当前自选 {len(symbols)} 只股票"},
            headers={"Cache-Control": "private, no-store"},
        )

    if normalized_path in {"stocks/watchlist/add", "stocks/watchlist/remove"} and method == "POST":
        payload = await _read_json_body(request)
        symbol = _normalize_symbol(payload.get("stock_code"))
        if normalized_path.endswith("/add"):
            symbols = await repo.add_watchlist(user_id, symbol)
        else:
            symbols = await repo.remove_watchlist(user_id, symbol)
        try_sync_watchlist_portfolio(user_id, symbols)
        return JSONResponse(
            {"stock_codes": symbols, "message": f"当前自选 {len(symbols)} 只股票"},
            headers={"Cache-Control": "private, no-store"},
        )

    if normalized_path == "analysis/analyze" and method == "POST":
        payload = await _read_json_body(request)
        response = await _send_upstream(normalized_path, request, json_body=payload)
        if response.status_code < 500:
            response_payload = _upstream_json(response)
            for task_id, stock_code in _extract_task_claims(payload, response_payload):
                await repo.claim_task(user_id, task_id, stock_code)
        return _forward_response(response)

    if normalized_path == "analysis/tasks" and method == "GET":
        response = await _send_upstream(normalized_path, request)
        if response.status_code >= 400:
            return _forward_response(response)
        owned_refs = await repo.owned_task_refs(user_id)
        payload = _filter_task_payload(_upstream_json(response), owned_refs)
        for task in payload.get("tasks", []):
            task_id = str(task.get("task_id") or "")
            query_id = _extract_query_id_from_task(task)
            if task_id and query_id:
                await repo.claim_task(
                    user_id,
                    task_id,
                    str(task.get("stock_code") or "UNKNOWN"),
                    query_id=query_id,
                    stock_name=(
                        str(task.get("stock_name"))
                        if task.get("stock_name")
                        else None
                    ),
                )
        return JSONResponse(payload, headers={"Cache-Control": "private, no-store"})

    task_match = _TASK_PATH_RE.fullmatch(normalized_path)
    if task_match and method == "GET":
        task_id = task_match.group(1) or task_match.group(2) or ""
        if not await repo.owns_task_ref(user_id, task_id):
            raise HTTPException(status_code=404, detail="Analysis task not found")
        response = await _send_upstream(normalized_path, request)
        if task_match.group(1) and response.status_code < 400:
            payload = _upstream_json(response)
            query_id = _extract_query_id_from_task(payload)
            if query_id:
                result = payload.get("result")
                result_payload = result if isinstance(result, dict) else {}
                await repo.claim_task(
                    user_id,
                    task_id,
                    str(
                        payload.get("stock_code")
                        or result_payload.get("stock_code")
                        or "UNKNOWN"
                    ),
                    query_id=query_id,
                    stock_name=(
                        str(
                            payload.get("stock_name")
                            or result_payload.get("stock_name")
                        )
                        if payload.get("stock_name")
                        or result_payload.get("stock_name")
                        else None
                    ),
                )
        return _forward_response(response)

    if normalized_path == "history" and method == "GET":
        if request.query_params.get("report_type") == "market_review":
            return _forward_response(await _send_upstream(normalized_path, request))
        response = await _send_upstream(
            normalized_path,
            request,
            query=[
                (key, value)
                for key, value in request.query_params.multi_items()
                if key not in {"page", "limit"}
            ]
            + [("page", "1"), ("limit", "100")],
        )
        if response.status_code >= 400:
            return _forward_response(response)
        payload = _filter_history_payload(_upstream_json(response), await repo.owned_task_refs(user_id))
        return JSONResponse(payload, headers={"Cache-Control": "private, no-store"})

    history_match = _HISTORY_DETAIL_RE.fullmatch(normalized_path)
    if history_match and method == "GET":
        record_id, child = history_match.groups()
        authorized = await _authorize_history(record_id, request, user_id)
        if child is None or authorized.status_code >= 400:
            return _forward_response(authorized)
        return _forward_response(await _send_upstream(normalized_path, request))

    if normalized_path == "decision-signals" and method == "GET":
        response = await _send_upstream(normalized_path, request)
        if response.status_code >= 400:
            return _forward_response(response)
        payload = _filter_signal_payload(_upstream_json(response), await repo.owned_task_refs(user_id))
        return JSONResponse(payload, headers={"Cache-Control": "private, no-store"})

    if normalized_path == "decision-signals" and method == "POST":
        payload = await _read_json_body(request)
        trace_id = str(payload.get("trace_id") or "")
        if not trace_id or not await repo.owns_task_ref(user_id, trace_id):
            raise HTTPException(status_code=404, detail="Source research report not found")
        return _forward_response(await _send_upstream(normalized_path, request, json_body=payload))

    if normalized_path.startswith("decision-signals/latest/") and method == "GET":
        response = await _send_upstream(normalized_path, request)
        if response.status_code >= 400:
            return _forward_response(response)
        payload = _upstream_json(response)
        trace_id = str(payload.get("trace_id") or "")
        if not trace_id or not await repo.owns_task_ref(user_id, trace_id):
            raise HTTPException(status_code=404, detail="Decision signal not found")
        return _forward_response(response)

    signal_match = _SIGNAL_DETAIL_RE.fullmatch(normalized_path)
    if signal_match:
        signal_id = signal_match.group(1)
        authorized = await _authorize_signal(signal_id, request, user_id)
        if method == "GET" and signal_match.group(2) is None:
            return _forward_response(authorized)
        if authorized.status_code >= 400:
            return _forward_response(authorized)
        return _forward_response(await _send_upstream(normalized_path, request))

    if normalized_path == "decision-signals/reassess" and method == "POST":
        payload = await _read_json_body(request)
        report_id = str(payload.get("source_report_id") or "")
        if not report_id:
            raise HTTPException(status_code=422, detail="source_report_id is required")
        authorized = await _authorize_history(report_id, request, user_id)
        if authorized.status_code >= 400:
            return _forward_response(authorized)
        return _forward_response(await _send_upstream(normalized_path, request, json_body=payload))

    if normalized_path == "analysis/market-review" and method == "POST":
        if not is_admin:
            raise HTTPException(status_code=403, detail="Administrator access is required")
        return _forward_response(await _send_upstream(normalized_path, request))

    if (
        normalized_path.startswith("intelligence/sources")
        or normalized_path.startswith("system/")
        or normalized_path.startswith("usage/")
    ):
        if not is_admin:
            raise HTTPException(status_code=403, detail="Administrator access is required")
        return _forward_response(await _send_upstream(normalized_path, request))

    # DSA chat sessions, alerts, backtests, portfolio state, global task streams,
    # and every unknown route stay unreachable until they have an explicit
    # tenant ownership model.
    raise HTTPException(status_code=404, detail="Market endpoint not available")
