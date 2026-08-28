from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import Response
from starlette.requests import Request

from app.gateway.auth_disabled import AUTH_SOURCE_SESSION
from app.gateway.routers import finance_portfolios


class _BridgeResponse:
    status_code = 200
    is_error = False

    def json(self) -> dict:
        return {
            "summary": {
                "portfolioCount": 1,
                "activeCount": 1,
                "withStrategyCount": 0,
                "withSnapshotCount": 0,
            },
            "portfolios": [],
        }


class _SetupBridgeResponse:
    status_code = 201
    is_error = False

    def json(self) -> dict:
        return {
            "idempotentReplay": False,
            "portfolio": {"id": "00000000-0000-0000-0000-000000000010"},
        }


def _request(user_id: str) -> Request:
    request = Request({"type": "http", "headers": []})
    request.state.user = SimpleNamespace(id=user_id)
    request.state.auth_source = AUTH_SOURCE_SESSION
    return request


@pytest.mark.anyio
async def test_dashboard_proxies_owner_identity_without_exposing_secret(
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

        async def get(self, url, **kwargs):
            calls.append({"url": url, **kwargs})
            return _BridgeResponse()

    monkeypatch.setattr(finance_portfolios.httpx, "AsyncClient", _Client)
    monkeypatch.setenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "server-only-secret")
    monkeypatch.setenv(
        "DEERFLOW_FINANCE_BRIDGE_URL",
        "http://finance/internal/deerflow",
    )
    user_id = str(uuid4())
    response = Response()

    payload = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        response,
    )

    assert payload["summary"]["portfolioCount"] == 1
    assert response.headers["Cache-Control"] == "private, no-store"
    assert calls[0]["url"] == (
        "http://finance/internal/deerflow/agent/portfolio-dashboard"
    )
    headers = calls[0]["headers"]
    assert headers["X-DeerFlow-User-Id"] == user_id
    assert headers["X-DeerFlow-Bridge-Secret"] == "server-only-secret"
    UUID(headers["X-DeerFlow-Thread-Id"])
    UUID(headers["X-DeerFlow-Run-Id"])


@pytest.mark.anyio
async def test_setup_proxies_structured_input_without_agent_chat(
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

        async def post(self, url, **kwargs):
            calls.append({"url": url, **kwargs})
            return _SetupBridgeResponse()

    monkeypatch.setattr(finance_portfolios.httpx, "AsyncClient", _Client)
    monkeypatch.setenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "server-only-secret")
    monkeypatch.setenv(
        "DEERFLOW_FINANCE_BRIDGE_URL",
        "http://finance/internal/deerflow",
    )
    user_id = str(uuid4())
    response = Response()
    setup = {
        "idempotencyKey": "setup-00000001",
        "portfolio": {"name": "长期组合", "baseCurrency": "CNY"},
        "account": {
            "asOf": "2026-07-16T04:00:00Z",
            "positions": [],
            "cashBalances": [{"currency": "CNY", "amount": "1000"}],
        },
    }

    payload = await finance_portfolios.complete_portfolio_setup(
        setup,
        _request(user_id),
        response,
    )

    assert payload["idempotentReplay"] is False
    assert calls[0]["url"] == "http://finance/internal/deerflow/workspace/setup"
    assert calls[0]["json"] == setup
    assert calls[0]["headers"]["X-DeerFlow-User-Id"] == user_id
    assert calls[0]["headers"]["X-DeerFlow-Bridge-Secret"] == (
        "server-only-secret"
    )
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.anyio
async def test_dashboard_uses_local_store_when_bridge_secret_missing(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    user_id = str(uuid4())
    response = Response()

    payload = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        response,
    )

    assert payload["summary"]["portfolioCount"] == 0
    assert payload["portfolios"] == []
    assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.anyio
async def test_setup_uses_local_store_when_bridge_secret_missing(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    user_id = str(uuid4())
    response = Response()
    setup = {
        "idempotencyKey": "setup-local-1",
        "portfolio": {"name": "演示组合", "purpose": "答辩", "baseCurrency": "CNY", "benchmark": None},
        "account": {
            "asOf": "2026-08-22T02:00:00Z",
            "source": "manual",
            "positions": [],
            "cashBalances": [{"currency": "CNY", "amount": "10000"}],
        },
        "strategy": None,
        "captureSnapshot": True,
    }

    created = await finance_portfolios.complete_portfolio_setup(
        setup,
        _request(user_id),
        response,
    )
    dashboard = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        Response(),
    )

    assert created["idempotentReplay"] is False
    assert created["portfolio"]["name"] == "演示组合"
    assert dashboard["summary"]["portfolioCount"] == 1
    assert dashboard["portfolios"][0]["latestSnapshot"]["totalEquity"] == "10000.00"
    review = dashboard["portfolios"][0]["latestReview"]
    assert review is not None
    assert "已建立" in review["summary"]
    assert "10000.00" in review["summary"]
    assert dashboard["portfolios"][0]["performance"]["cashWeight"] == "1.0000"
    briefs = dashboard["portfolios"][0]["workspaceBriefs"]
    assert briefs["risk"]
    assert briefs["strategy"]
    assert briefs["sandbox"]


@pytest.mark.anyio
async def test_dashboard_creates_watchlist_linked_portfolio(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))

    async def _symbols(_user_id: str) -> list[str]:
        return ["600519", "300274"]

    monkeypatch.setattr(finance_portfolios, "_current_watchlist_symbols", _symbols)
    user_id = str(uuid4())
    payload = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        Response(),
    )

    assert payload["summary"]["portfolioCount"] == 1
    item = payload["portfolios"][0]
    assert item["watchlistLinked"] is True
    assert item["portfolio"]["name"] == "自选组合"
    assert [position["symbol"] for position in item["positions"]] == [
        "600519",
        "300274",
    ]
    assert all(position["quantity"] == "0" for position in item["positions"])
    assert all(position["source"] == "watchlist" for position in item["positions"])
    assert item["latestReview"] is not None
    assert "观察仓" in item["latestReview"]["summary"]


@pytest.mark.anyio
async def test_dashboard_backfills_opening_review_for_existing_portfolio(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    user_id = str(uuid4())
    store_dir = tmp_path / "local_finance"
    store_dir.mkdir(parents=True)
    (store_dir / f"{user_id}.json").write_text(
        """
        {
          "portfolios": [
            {
              "portfolio": {
                "id": "11111111-1111-1111-1111-111111111111",
                "name": "投资组合1",
                "purpose": "",
                "baseCurrency": "CNY",
                "benchmark": null,
                "status": "active",
                "revision": 1,
                "createdAt": "2026-08-24T06:52:04Z",
                "updatedAt": "2026-08-24T06:52:04Z",
                "archivedAt": null
              },
              "strategyCount": 1,
              "activeStrategy": {
                "id": "22222222-2222-2222-2222-222222222222",
                "objective": "长期稳健",
                "horizon": "2年以上"
              },
              "positions": [],
              "cashBalances": [
                {"currency": "CNY", "amount": "1E+4"}
              ],
              "latestSnapshot": {
                "sessionDate": "2026-08-24",
                "holdingsValue": "0.00",
                "cashValue": "10000.00",
                "totalEquity": "10000.00",
                "snapshotHash": "local"
              },
              "latestReview": null,
              "performance": {
                "status": "insufficient_data",
                "cashWeight": null
              }
            }
          ],
          "idempotency": {}
        }
        """,
        encoding="utf-8",
    )

    payload = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        Response(),
    )

    item = payload["portfolios"][0]
    assert item["latestReview"]["summary"].startswith("组合「投资组合1」已建立")
    assert item["cashBalances"][0]["amount"] == "10000.00"
    assert item["performance"]["cashWeight"] == "1.0000"
    assert "现金" in item["workspaceBriefs"]["risk"]


@pytest.mark.anyio
async def test_watchlist_sync_does_not_overwrite_manual_portfolio(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("DEERFLOW_FINANCE_BRIDGE_SECRET", raising=False)
    monkeypatch.setenv("DEER_FLOW_HOME", str(tmp_path))
    user_id = str(uuid4())
    setup = {
        "idempotencyKey": "setup-local-2",
        "portfolio": {
            "name": "实盘组合",
            "purpose": "已记账持仓",
            "baseCurrency": "CNY",
            "benchmark": None,
        },
        "account": {
            "asOf": "2026-08-22T02:00:00Z",
            "source": "manual",
            "positions": [
                {
                    "market": "CN",
                    "symbol": "000001",
                    "name": "平安银行",
                    "quantity": "100",
                    "averageCost": "10",
                    "currency": "CNY",
                }
            ],
            "cashBalances": [{"currency": "CNY", "amount": "5000"}],
        },
        "strategy": None,
        "captureSnapshot": True,
    }
    await finance_portfolios.complete_portfolio_setup(
        setup,
        _request(user_id),
        Response(),
    )

    async def _symbols(_user_id: str) -> list[str]:
        return ["600519"]

    monkeypatch.setattr(finance_portfolios, "_current_watchlist_symbols", _symbols)
    dashboard = await finance_portfolios.get_portfolio_dashboard(
        _request(user_id),
        Response(),
    )

    assert dashboard["summary"]["portfolioCount"] == 2
    assert dashboard["portfolios"][0]["portfolio"]["name"] == "自选组合"
    assert dashboard["portfolios"][0]["positions"][0]["symbol"] == "600519"
    assert dashboard["portfolios"][1]["portfolio"]["name"] == "实盘组合"
    assert dashboard["portfolios"][1]["positions"][0]["quantity"] == "100"
