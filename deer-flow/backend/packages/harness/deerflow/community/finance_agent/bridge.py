from __future__ import annotations

import os
from uuid import UUID

_DEFAULT_BRIDGE_URL = "http://finance-api:8000/internal/deerflow"


def finance_bridge_base_url() -> str:
    return os.getenv("DEERFLOW_FINANCE_BRIDGE_URL", _DEFAULT_BRIDGE_URL).rstrip("/")


def build_finance_bridge_headers(
    *,
    user_id: str,
    thread_id: str,
    run_id: str,
) -> dict[str, str]:
    secret = os.getenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "")
    if not secret:
        raise RuntimeError("DEERFLOW_FINANCE_BRIDGE_SECRET is not configured")

    canonical = {
        label: _canonical_uuid(value, label)
        for value, label in (
            (user_id, "user_id"),
            (thread_id, "thread_id"),
            (run_id, "run_id"),
        )
    }
    return {
        "X-DeerFlow-Bridge-Secret": secret,
        "X-DeerFlow-User-Id": canonical["user_id"],
        "X-DeerFlow-Thread-Id": canonical["thread_id"],
        "X-DeerFlow-Run-Id": canonical["run_id"],
    }


def _canonical_uuid(value: str, label: str) -> str:
    try:
        return str(UUID(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"MetaInsight {label} must be a UUID") from exc
