from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock

import httpx
import pytest

from app.gateway.dsa_automation import DsaAutomationService, extract_dsa_summary


def _response(path: str, payload: dict) -> httpx.Response:
    request = httpx.Request("GET", f"http://stock-server:8000/api/v1/{path}")
    return httpx.Response(200, json=payload, request=request)


def _history(*rows: dict) -> dict:
    return {"data": list(rows)}


def _row(
    day: str,
    *,
    open_price: float = 108.0,
    high: float = 109.26,
    low: float = 100.73,
    close: float = 108.29,
    volume: float = 96_031_100,
) -> dict:
    return {
        "date": day,
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    }


def _quote(**overrides: float | str) -> dict:
    payload: dict[str, float | str] = {
        "stock_code": "300274",
        "current_price": 108.95,
        "prev_close": 108.29,
        "open": 110.09,
        "high": 111.15,
        "low": 107.65,
        "volume": 54_348_000,
        "update_time": "2026-07-15T15:20:00+08:00",
    }
    payload.update(overrides)
    return payload


def test_gateway_registers_dsa_settings_and_notification_inbox_routes() -> None:
    from app.gateway.app import create_app

    paths = {route.path for route in create_app().routes}
    assert "/api/v1/dsa-automation/settings" in paths
    assert "/api/v1/notifications" in paths
    assert "/api/v1/notifications/read-all" in paths


def test_extract_dsa_summary_prefers_report_summary_and_stays_compact() -> None:
    summary = extract_dsa_summary(
        {
            "result": {
                "report": {
                    "summary": {
                        "analysis_summary": "趋势修复，成交量仍需确认。",
                        "operation_advice": "继续观察关键支撑。",
                    }
                }
            }
        }
    )

    assert summary == "趋势修复，成交量仍需确认。 · 继续观察关键支撑。"
    assert len(summary) <= 240


@pytest.mark.asyncio
async def test_market_data_ready_accepts_same_day_closed_bar() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _response(
        "stocks/300274/history",
        _history(_row("2026-07-14"), _row("2026-07-15", close=108.95)),
    )

    ready, source = await DsaAutomationService()._market_data_ready(
        client,
        "300274",
        date(2026, 7, 15),
        datetime(2026, 7, 15, 7, 11, tzinfo=UTC),
    )

    assert ready is True
    assert source == "closed_bar"
    assert client.get.await_count == 1


@pytest.mark.asyncio
async def test_market_data_ready_uses_verified_quote_when_daily_bar_is_delayed() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        _response("stocks/300274/history", _history(_row("2026-07-14"))),
        _response("stocks/300274/quote", _quote()),
    ]

    ready, source = await DsaAutomationService()._market_data_ready(
        client,
        "300274",
        date(2026, 7, 15),
        datetime(2026, 7, 15, 7, 20, tzinfo=UTC),
    )

    assert ready is True
    assert source == "quote_fallback"
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_market_data_ready_waits_for_quote_fallback_grace_period(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DSA_AUTOMATION_QUOTE_FALLBACK_MINUTES", "5")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.return_value = _response(
        "stocks/300274/history",
        _history(_row("2026-07-14")),
    )

    ready, source = await DsaAutomationService()._market_data_ready(
        client,
        "300274",
        date(2026, 7, 15),
        datetime(2026, 7, 15, 7, 14, tzinfo=UTC),
    )

    assert ready is False
    assert source == "waiting_for_closed_bar"
    assert client.get.await_count == 1


@pytest.mark.asyncio
async def test_market_data_ready_rejects_stale_previous_session_quote() -> None:
    previous = _row("2026-07-14")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        _response("stocks/300274/history", _history(previous)),
        _response(
            "stocks/300274/quote",
            _quote(
                current_price=previous["close"],
                prev_close=108.0,
                open=previous["open"],
                high=previous["high"],
                low=previous["low"],
                volume=previous["volume"],
            ),
        ),
    ]

    ready, source = await DsaAutomationService()._market_data_ready(
        client,
        "300274",
        date(2026, 7, 15),
        datetime(2026, 7, 15, 8, 0, tzinfo=UTC),
    )

    assert ready is False
    assert source == "quote_not_new_session"


@pytest.mark.asyncio
async def test_market_data_ready_rejects_quote_without_complete_ohlcv() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        _response("stocks/300274/history", _history(_row("2026-07-14"))),
        _response("stocks/300274/quote", _quote(volume=0)),
    ]

    ready, source = await DsaAutomationService()._market_data_ready(
        client,
        "300274",
        date(2026, 7, 15),
        datetime(2026, 7, 15, 8, 0, tzinfo=UTC),
    )

    assert ready is False
    assert source == "quote_incomplete"
