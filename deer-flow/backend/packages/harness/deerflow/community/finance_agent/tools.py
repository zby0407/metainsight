from __future__ import annotations

import json
import os
from typing import Any, Literal
from uuid import UUID

import httpx
from langchain.tools import tool
from langchain_core.messages import BaseMessage

from deerflow.runtime.user_context import DEFAULT_USER_ID, resolve_runtime_user_id
from deerflow.tools.types import Runtime

from .bridge import build_finance_bridge_headers, finance_bridge_base_url

_REQUEST_TIMEOUT_SECONDS = 90.0


@tool("finance_capability_catalog", parse_docstring=True)
async def finance_capability_catalog_tool(
    runtime: Runtime,
    environment: Literal["recorded", "simulation"] = "recorded",
) -> str:
    """Discover the current portfolio, strategy, daily-review, and simulation capabilities.

    This is the source of truth for capability names and JSON input schemas. Call it
    once per environment in a run, reuse that result for every following call, and
    never guess a capability name or resource ID.

    Args:
        environment: Use recorded for real portfolio records and simulation for isolated paper ledgers.
    """
    return await _bridge_request(
        runtime,
        "POST",
        "/agent/capabilities",
        payload={"environment": environment},
    )


@tool("finance_capability_execute", parse_docstring=True)
async def finance_capability_execute_tool(
    runtime: Runtime,
    capability_name: str,
    arguments: dict[str, Any],
    environment: Literal["recorded", "simulation"] = "recorded",
) -> str:
    """Execute one dynamically discovered finance Agent capability for the current user.

    Identity and task ownership are injected by DeerFlow and are intentionally absent
    from the model-visible arguments. Read, draft, and auto capabilities finish in this
    call. Only capabilities explicitly marked confirm return a pending action intent.
    Any capability that would change positions or strategy must honor the investor
    risk profile stored in memory (cash floor and single-stock cap).

    Args:
        capability_name: Exact name returned by finance_capability_catalog.
        arguments: Exact JSON object matching that capability's advertised inputSchema.
        environment: The same recorded or simulation environment used for discovery.
    """
    name = capability_name.strip()
    if not name or "/" in name or ".." in name:
        return _json_error("INVALID_CAPABILITY_NAME", "Capability name is invalid.")
    return await _bridge_request(
        runtime,
        "POST",
        f"/agent/capabilities/{name}",
        payload={"arguments": arguments, "environment": environment},
    )


@tool("finance_action_intent", parse_docstring=True)
async def finance_action_intent_tool(
    runtime: Runtime,
    operation: Literal["confirm", "cancel"],
    intent_id: str,
) -> str:
    """Confirm or cancel a prepared finance action after an explicit user reply.

    Before calling this tool, show the prepared preview and use ask_clarification.
    The user's latest message must be exactly `确认执行 <intent_id>` for confirm or
    `取消 <intent_id>` for cancel. This tool validates the real HumanMessage from
    DeerFlow state, so the model cannot manufacture confirmation itself.

    Args:
        operation: Confirm executes the frozen preview; cancel discards it.
        intent_id: Exact actionIntentId returned by a prepare capability.
    """
    try:
        canonical_intent_id = str(UUID(intent_id))
    except (TypeError, ValueError):
        return _json_error("INVALID_ACTION_INTENT_ID", "Action intent ID must be a UUID.")

    expected = (
        f"确认执行 {canonical_intent_id}"
        if operation == "confirm"
        else f"取消 {canonical_intent_id}"
    )
    latest_user_text = _latest_user_text(runtime)
    if latest_user_text.strip() != expected:
        return json.dumps(
            {
                "status": "blocked",
                "errorCode": "EXPLICIT_USER_CONFIRMATION_REQUIRED",
                "message": "The latest MetaInsight user message does not match the required confirmation phrase.",
                "requiredUserReply": expected,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return await _bridge_request(
        runtime,
        "POST",
        f"/agent/action-intents/{canonical_intent_id}/{operation}",
        payload={},
    )


async def _bridge_request(
    runtime: Runtime,
    method: str,
    path: str,
    *,
    payload: dict[str, Any],
) -> str:
    if not os.getenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "").strip():
        from app.gateway.local_finance_capabilities import handle_local_bridge_request

        return handle_local_bridge_request(runtime, method, path, payload)
    try:
        headers = _bridge_headers(runtime)
        base_url = finance_bridge_base_url()
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.request(
                method,
                f"{base_url}{path}",
                headers=headers,
                json=payload,
            )
        data = response.json()
        if response.is_error:
            return json.dumps(
                {
                    "status": "failed",
                    "errorCode": f"FINANCE_BRIDGE_HTTP_{response.status_code}",
                    "detail": data.get("detail") if isinstance(data, dict) else "Finance bridge request failed.",
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    except (RuntimeError, ValueError) as exc:
        return _json_error("FINANCE_BRIDGE_CONTEXT_ERROR", str(exc))
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        return _json_error(
            "FINANCE_BRIDGE_UNAVAILABLE",
            f"Finance capability service is unavailable ({type(exc).__name__}).",
        )


def _bridge_headers(runtime: Runtime) -> dict[str, str]:
    context = runtime.context or {}
    user_id = resolve_runtime_user_id(runtime)
    if user_id == DEFAULT_USER_ID:
        raise RuntimeError("Authenticated MetaInsight user context is required")
    thread_id = str(context.get("thread_id") or "")
    run_id = str(context.get("run_id") or "")
    return build_finance_bridge_headers(
        user_id=user_id,
        thread_id=thread_id,
        run_id=run_id,
    )


def _latest_user_text(runtime: Runtime) -> str:
    state = runtime.state or {}
    messages = state.get("messages") or []
    for message in reversed(messages):
        if _is_human_message(message):
            return _message_text(message)
    return ""


def _is_human_message(message: object) -> bool:
    if isinstance(message, BaseMessage):
        return message.type == "human"
    if isinstance(message, dict):
        return message.get("type") == "human" or message.get("role") == "user"
    return False


def _message_text(message: object) -> str:
    content = message.content if isinstance(message, BaseMessage) else message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts)
    return str(content or "")


def _json_error(code: str, message: str) -> str:
    return json.dumps(
        {"status": "failed", "errorCode": code, "message": message},
        ensure_ascii=False,
        separators=(",", ":"),
    )
