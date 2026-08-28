"""Security contracts for the authenticated, tenant-scoped DSA facade."""

import pytest

from app.gateway.routers.market_proxy import (
    _extract_query_id_from_task,
    _extract_task_claims,
    _filter_history_payload,
    _filter_signal_payload,
    _filter_task_payload,
    _is_shared_market_read,
)
from deerflow.persistence.dsa.repository import DsaTenantRepository


@pytest.fixture
async def tenant_repo(tmp_path):
    from deerflow.persistence.engine import close_engine, get_session_factory, init_engine
    from deerflow.persistence.user.model import UserRow

    await init_engine(
        "sqlite",
        url=f"sqlite+aiosqlite:///{tmp_path / 'market.db'}",
        sqlite_dir=str(tmp_path),
    )
    session_factory = get_session_factory()
    async with session_factory() as session, session.begin():
        session.add_all(
            [
                UserRow(
                    id="00000000-0000-0000-0000-00000000000a",
                    email="a@example.com",
                    system_role="user",
                ),
                UserRow(
                    id="00000000-0000-0000-0000-00000000000b",
                    email="b@example.com",
                    system_role="user",
                ),
            ]
        )
    yield DsaTenantRepository(session_factory)
    await close_engine()


@pytest.mark.anyio
async def test_watchlists_and_task_claims_are_account_scoped(tenant_repo) -> None:
    user_a = "00000000-0000-0000-0000-00000000000a"
    user_b = "00000000-0000-0000-0000-00000000000b"

    await tenant_repo.add_watchlist(user_a, "600519")
    await tenant_repo.add_watchlist(user_b, "300274")
    await tenant_repo.claim_task(user_a, "task-a", "600519", query_id="query-a")

    assert await tenant_repo.list_watchlist(user_a) == ["600519"]
    assert await tenant_repo.list_watchlist(user_b) == ["300274"]
    assert await tenant_repo.owns_task_ref(user_a, "query-a") is True
    assert await tenant_repo.owns_task_ref(user_b, "query-a") is False


def test_history_filter_keeps_only_owned_query_ids() -> None:
    payload = {
        "items": [
            {"id": 1, "query_id": "task-a", "stock_code": "600519"},
            {"id": 2, "query_id": "task-b", "stock_code": "300274"},
        ],
        "total": 2,
        "page": 1,
        "limit": 20,
    }

    filtered = _filter_history_payload(payload, {"task-a"})

    assert filtered["items"] == [payload["items"][0]]
    assert filtered["total"] == 1


def test_task_filter_keeps_only_claimed_task_ids() -> None:
    payload = {
        "tasks": [
            {"task_id": "task-a", "status": "completed"},
            {"task_id": "task-b", "status": "processing"},
        ],
        "total": 2,
        "pending": 0,
        "processing": 1,
    }

    filtered = _filter_task_payload(payload, {"task-b"})

    assert filtered["tasks"] == [payload["tasks"][1]]
    assert filtered["total"] == 1
    assert filtered["processing"] == 1


def test_signal_filter_uses_owned_trace_not_stock_code() -> None:
    payload = {
        "items": [
            {"id": 1, "stock_code": "600519", "trace_id": "task-a"},
            {"id": 2, "stock_code": "600519", "trace_id": "task-b"},
        ],
        "total": 2,
        "page": 1,
        "page_size": 20,
    }

    filtered = _filter_signal_payload(payload, {"task-a"})

    assert filtered["items"] == [payload["items"][0]]
    assert filtered["total"] == 1


def test_batch_analysis_claims_accepted_and_duplicate_tasks() -> None:
    request_payload = {"stock_codes": ["600519", "300274"]}
    response_payload = {
        "accepted": [{"stock_code": "600519", "task_id": "task-a"}],
        "duplicates": [
            {"stock_code": "300274", "existing_task_id": "task-b"}
        ],
    }

    assert _extract_task_claims(request_payload, response_payload) == [
        ("task-a", "600519"),
        ("task-b", "300274"),
    ]


def test_completed_task_extracts_report_query_id() -> None:
    assert (
        _extract_query_id_from_task(
            {"task_id": "task-a", "result": {"query_id": "query-a"}}
        )
        == "query-a"
    )
    assert _extract_query_id_from_task({"query_id": "query-b"}) == "query-b"


def test_market_route_allowlist_is_fail_closed() -> None:
    assert _is_shared_market_read("stocks/600519/quote", "GET") is True
    assert _is_shared_market_read("stocks/600519/history", "GET") is True
    assert _is_shared_market_read("intelligence/items", "GET") is True

    # Private/global DSA subsystems must never fall through as shared data.
    assert _is_shared_market_read("agent/chat/sessions", "GET") is False
    assert _is_shared_market_read("portfolio/accounts", "GET") is False
    assert _is_shared_market_read("system/config", "GET") is False
    assert _is_shared_market_read("stocks/watchlist", "GET") is False
