from __future__ import annotations

import json
from uuid import uuid4

import httpx
import pytest
from langchain.tools import ToolRuntime
from langchain_core.messages import HumanMessage

from deerflow.community.finance_agent import tools


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _Response:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.is_error = status_code >= 400

    def json(self) -> dict:
        return self._payload


def _runtime(message: str = "读取我的组合") -> ToolRuntime:
    user_id = str(uuid4())
    thread_id = str(uuid4())
    run_id = str(uuid4())
    return ToolRuntime(
        state={"messages": [HumanMessage(content=message)]},
        context={"user_id": user_id, "thread_id": thread_id, "run_id": run_id},
        config={"configurable": {"thread_id": thread_id}},
        stream_writer=lambda _: None,
        tool_call_id="call-1",
        store=None,
    )


@pytest.mark.anyio
async def test_execute_uses_runtime_identity_and_model_schema_has_no_identity(
    monkeypatch,
) -> None:
    calls: list[dict] = []

    class _Client:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def request(self, method, url, **kwargs):
            calls.append({"method": method, "url": url, **kwargs})
            return _Response({"capability": "portfolio_list", "result": {"status": "completed"}})

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    monkeypatch.setenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "secret-from-runtime")
    monkeypatch.setenv("DEERFLOW_FINANCE_BRIDGE_URL", "http://finance/internal/deerflow")
    runtime = _runtime()

    payload = json.loads(await tools.finance_capability_execute_tool.ainvoke({
        "runtime": runtime,
        "capability_name": "portfolio_list",
        "arguments": {},
        "environment": "recorded",
    }))

    assert payload["result"]["status"] == "completed"
    assert calls[0]["headers"] == {
        "X-DeerFlow-Bridge-Secret": "secret-from-runtime",
        "X-DeerFlow-User-Id": runtime.context["user_id"],
        "X-DeerFlow-Thread-Id": runtime.context["thread_id"],
        "X-DeerFlow-Run-Id": runtime.context["run_id"],
    }
    schema = tools.finance_capability_execute_tool.tool_call_schema.model_json_schema()
    properties = schema["properties"]
    assert "runtime" not in properties
    assert "user_id" not in properties
    assert "thread_id" not in properties
    assert "bridge_secret" not in properties


@pytest.mark.anyio
async def test_action_intent_requires_exact_latest_human_confirmation(
    monkeypatch,
) -> None:
    calls: list[str] = []

    class _Client:
        def __init__(self, **_kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def request(self, _method, url, **_kwargs):
            calls.append(url)
            return _Response({"intent_id": intent_id, "status": "executed", "result": {}, "artifact": {}})

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    monkeypatch.setenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "secret")
    intent_id = str(uuid4())

    blocked = json.loads(await tools.finance_action_intent_tool.ainvoke({
        "runtime": _runtime("我想创建这个组合"),
        "operation": "confirm",
        "intent_id": intent_id,
    }))

    assert blocked["status"] == "blocked"
    assert blocked["requiredUserReply"] == f"确认执行 {intent_id}"
    assert calls == []

    confirmed = json.loads(await tools.finance_action_intent_tool.ainvoke({
        "runtime": _runtime(f"确认执行 {intent_id}"),
        "operation": "confirm",
        "intent_id": intent_id,
    }))

    assert confirmed["status"] == "executed"
    assert calls[0].endswith(f"/agent/action-intents/{intent_id}/confirm")


@pytest.mark.anyio
async def test_catalog_uses_local_store_when_bridge_secret_missing(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    runtime = _runtime()

    payload = json.loads(
        await tools.finance_capability_catalog_tool.ainvoke(
            {"runtime": runtime, "environment": "recorded"}
        )
    )

    names = {item["name"] for item in payload["capabilities"]}
    assert payload["mode"] == "local"
    assert "portfolio_list" in names
    assert "fact_pack_build" in names
    assert "daily_review_save" in names


@pytest.mark.anyio
async def test_local_portfolio_get_reads_watchlist_linked_item(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    from app.gateway.local_finance_store import sync_watchlist_portfolio

    runtime = _runtime()
    user_id = runtime.context["user_id"]
    dashboard = sync_watchlist_portfolio(user_id, ["600519"])
    portfolio_id = dashboard["portfolios"][0]["portfolio"]["id"]

    payload = json.loads(
        await tools.finance_capability_execute_tool.ainvoke(
            {
                "runtime": runtime,
                "capability_name": "portfolio_get",
                "arguments": {"portfolioId": portfolio_id},
                "environment": "recorded",
            }
        )
    )

    assert payload["result"]["status"] == "completed"
    assert payload["result"]["portfolio"]["name"] == "自选组合"
    assert payload["result"]["positions"][0]["symbol"] == "600519"
