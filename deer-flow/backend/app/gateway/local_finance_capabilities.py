"""Local finance-agent capabilities used when finance-api is not configured."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.gateway.local_finance_store import get_item, load_dashboard, save_latest_review
from deerflow.runtime.user_context import DEFAULT_USER_ID, resolve_runtime_user_id

_RECORDED_CAPABILITIES = (
    {
        "name": "portfolio_list",
        "actionLevel": "read",
        "description": "List the current user's portfolios.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "portfolio_get",
        "actionLevel": "read",
        "description": "Read one owned portfolio, including positions and the latest snapshot.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "account_get",
        "actionLevel": "read",
        "description": "Read cash and position lots for one owned portfolio.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "strategy_get",
        "actionLevel": "read",
        "description": "Read the active strategy version, if any.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "snapshot_get",
        "actionLevel": "read",
        "description": "Read the latest valuation snapshot.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "fact_pack_get",
        "actionLevel": "read",
        "description": "Read the latest deterministic fact pack derived from local holdings.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "fact_pack_build",
        "actionLevel": "auto",
        "description": "Build a deterministic fact pack from the current local snapshot.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "daily_review_get",
        "actionLevel": "read",
        "description": "Read the latest saved daily review.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
    {
        "name": "daily_review_save",
        "actionLevel": "draft",
        "description": "Save a daily review draft onto the local portfolio record.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId", "summary"],
            "properties": {
                "portfolioId": {"type": "string"},
                "summary": {"type": "string"},
                "assessment": {
                    "type": "string",
                    "enum": ["on_track", "watch", "breached", "insufficient_data"],
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "daily_review_publish",
        "actionLevel": "auto",
        "description": "Publish the latest daily review on the local portfolio record.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId", "summary"],
            "properties": {
                "portfolioId": {"type": "string"},
                "summary": {"type": "string"},
                "assessment": {
                    "type": "string",
                    "enum": ["on_track", "watch", "breached", "insufficient_data"],
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "history_attribution_get",
        "actionLevel": "read",
        "description": "Read available local performance fields. Multi-day attribution needs more snapshots.",
        "inputSchema": {
            "type": "object",
            "required": ["portfolioId"],
            "properties": {"portfolioId": {"type": "string"}},
            "additionalProperties": False,
        },
    },
)


def handle_local_bridge_request(
    runtime: Any,
    method: str,
    path: str,
    payload: dict[str, Any],
) -> str:
    user_id = resolve_runtime_user_id(runtime)
    if user_id == DEFAULT_USER_ID:
        return _error("FINANCE_BRIDGE_CONTEXT_ERROR", "Authenticated MetaInsight user context is required")

    method = method.upper()
    if method == "POST" and path == "/agent/capabilities":
        environment = str((payload or {}).get("environment") or "recorded")
        return _ok(
            {
                "environment": environment,
                "mode": "local",
                "capabilities": list(_RECORDED_CAPABILITIES)
                if environment == "recorded"
                else [],
                "note": "本机未配置外部组合服务，已使用本地组合记录完成读写。",
            }
        )
    if method == "POST" and path.startswith("/agent/capabilities/"):
        name = path.rsplit("/", 1)[-1]
        arguments = (payload or {}).get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}
        return _execute(user_id, name, arguments)
    if path.startswith("/agent/action-intents/"):
        return _error(
            "LOCAL_CONFIRM_UNSUPPORTED",
            "本地组合模式没有需要确认的外部指令，请直接使用 catalog 中的 read/draft/auto 能力。",
        )
    return _error("UNKNOWN_BRIDGE_PATH", f"Unsupported local finance path: {path}")


def _execute(user_id: str, name: str, arguments: dict[str, Any]) -> str:
    if name == "portfolio_list":
        dashboard = load_dashboard(user_id)
        return _completed(
            name,
            {
                "portfolios": [item.get("portfolio") for item in dashboard.get("portfolios") or []],
                "summary": dashboard.get("summary"),
            },
        )

    portfolio_id = str(arguments.get("portfolioId") or "").strip()
    item = get_item(user_id, portfolio_id) if portfolio_id else None
    if name in {
        "portfolio_get",
        "account_get",
        "strategy_get",
        "snapshot_get",
        "fact_pack_get",
        "fact_pack_build",
        "daily_review_get",
        "daily_review_save",
        "daily_review_publish",
        "history_attribution_get",
    } and item is None:
        return _error("PORTFOLIO_NOT_FOUND", "Portfolio not found for the current user.")

    if name == "portfolio_get":
        return _completed(name, item)
    if name == "account_get":
        return _completed(
            name,
            {
                "portfolioId": portfolio_id,
                "positions": item.get("positions") or [],
                "cashBalances": item.get("cashBalances") or [],
            },
        )
    if name == "strategy_get":
        return _completed(name, {"activeStrategy": item.get("activeStrategy")})
    if name == "snapshot_get":
        return _completed(name, {"latestSnapshot": item.get("latestSnapshot")})
    if name in {"fact_pack_get", "fact_pack_build"}:
        return _completed(name, {"factPack": _fact_pack(item)})
    if name == "daily_review_get":
        return _completed(name, {"latestReview": item.get("latestReview")})
    if name in {"daily_review_save", "daily_review_publish"}:
        review = _review_from_arguments(item, arguments, published=name.endswith("publish"))
        saved = save_latest_review(user_id, portfolio_id, review)
        return _completed(name, {"latestReview": (saved or item).get("latestReview")})
    if name == "history_attribution_get":
        return _completed(
            name,
            {
                "performance": item.get("performance"),
                "latestSnapshot": item.get("latestSnapshot"),
                "dataGaps": ["local_store_has_no_multi_day_attribution"],
            },
        )
    return _error("UNKNOWN_CAPABILITY", f"Capability {name} is not available in local mode.")


def _fact_pack(item: dict[str, Any]) -> dict[str, Any]:
    positions = [row for row in (item.get("positions") or []) if isinstance(row, dict)]
    snapshot = item.get("latestSnapshot") if isinstance(item.get("latestSnapshot"), dict) else {}
    return {
        "portfolioId": item.get("portfolio", {}).get("id"),
        "asOf": snapshot.get("sessionDate") or datetime.now(UTC).date().isoformat(),
        "positionCount": len(positions),
        "symbols": [str(row.get("symbol") or "") for row in positions],
        "holdingsValue": snapshot.get("holdingsValue"),
        "cashValue": snapshot.get("cashValue"),
        "totalEquity": snapshot.get("totalEquity"),
        "performance": item.get("performance"),
        "watchlistLinked": bool(item.get("watchlistLinked")),
        "dataGaps": list((item.get("performance") or {}).get("dataGaps") or [])
        + (["watchlist_positions_have_no_size"] if item.get("watchlistLinked") else []),
    }


def _review_from_arguments(
    item: dict[str, Any],
    arguments: dict[str, Any],
    *,
    published: bool,
) -> dict[str, Any]:
    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    previous = item.get("latestReview") if isinstance(item.get("latestReview"), dict) else {}
    return {
        "id": previous.get("id") or str(uuid4()),
        "portfolioId": item.get("portfolio", {}).get("id"),
        "strategyVersionId": (item.get("activeStrategy") or {}).get("id")
        or previous.get("strategyVersionId")
        or str(uuid4()),
        "reviewDate": now[:10],
        "status": "published" if published else "draft",
        "assessment": arguments.get("assessment") or previous.get("assessment") or "insufficient_data",
        "revision": int(previous.get("revision") or 0) + 1,
        "summary": str(arguments.get("summary") or previous.get("summary") or ""),
        "payload": {},
        "evidenceIds": [],
        "dataCutoff": now,
        "inputSnapshotHash": (item.get("latestSnapshot") or {}).get("snapshotHash") or "local",
        "createdAt": previous.get("createdAt") or now,
        "updatedAt": now,
        "publishedAt": now if published else None,
    }


def _completed(name: str, result: Any) -> str:
    return _ok({"capability": name, "result": {"status": "completed", **(result if isinstance(result, dict) else {"value": result})}})


def _ok(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _error(code: str, message: str) -> str:
    return json.dumps(
        {"status": "failed", "errorCode": code, "message": message},
        ensure_ascii=False,
        separators=(",", ":"),
    )
