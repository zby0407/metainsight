from __future__ import annotations

from decimal import Decimal

import pytest

from app.gateway import portfolio_live


def test_apply_item_marks_holdings_to_market() -> None:
    item = {
        "positions": [
            {
                "symbol": "000002",
                "quantity": "80000",
                "averageCost": "6.50",
            }
        ],
        "cashBalances": [{"currency": "CNY", "amount": "50000"}],
        "latestSnapshot": {
            "holdingsValue": "520000.00",
            "cashValue": "50000.00",
            "totalEquity": "570000.00",
        },
        "performance": {
            "status": "insufficient_data",
            "dailyReturn": None,
            "dailyPnl": None,
            "unrealizedReturn": "-0.3800",
            "cashWeight": "0.0500",
            "maxDrawdown": None,
            "annualizedVolatility": None,
            "dataGaps": [],
        },
    }
    quotes = {
        "000002": {
            "current_price": 5.20,
            "prev_close": 5.10,
            "change_percent": 1.9608,
        }
    }
    history = {
        "000002": [
            {"date": f"2026-04-{day:02d}", "close": Decimal("5.00")}
            for day in range(1, 8)
        ]
        + [
            {"date": f"2026-04-{day:02d}", "close": Decimal("6.20")}
            for day in range(8, 15)
        ]
        + [
            {"date": f"2026-04-{day:02d}", "close": Decimal("4.90")}
            for day in range(15, 29)
        ]
    }

    portfolio_live._apply_item(item, quotes, history)

    assert item["performance"]["live"] is True
    assert item["performance"]["unrealizedReturn"] == "-0.2000"
    assert item["performance"]["unrealizedPnl"] == "-104000.00"
    assert item["performance"]["dailyPnl"] == "8000.00"
    assert item["performance"]["dailyReturn"] == "0.0175"
    assert item["latestSnapshot"]["holdingsValue"] == "416000.00"
    assert item["latestSnapshot"]["totalEquity"] == "466000.00"
    assert item["performance"]["cashWeight"] == "0.1073"
    assert item["performance"]["maxDrawdown"] is not None
    assert item["performance"]["annualizedVolatility"] is not None
    assert item["performance"]["status"] == "complete"


def test_apply_item_skips_watchlist_without_size() -> None:
    item = {
        "positions": [{"symbol": "600519", "quantity": "0", "averageCost": "0"}],
        "performance": {"status": "insufficient_data", "dailyReturn": None},
    }
    portfolio_live._apply_item(
        item,
        {"600519": {"current_price": 1400, "prev_close": 1390}},
        {},
    )
    assert item["performance"].get("live") is not True
    assert item["performance"]["dailyReturn"] is None


@pytest.mark.anyio
async def test_apply_live_performance_fail_open(monkeypatch) -> None:
    async def _boom(_symbols):
        raise RuntimeError("stock-server down")

    monkeypatch.setattr(portfolio_live, "_fetch_quotes", _boom)
    dashboard = {
        "portfolios": [
            {
                "positions": [
                    {"symbol": "000002", "quantity": "1", "averageCost": "1"}
                ],
                "performance": {"dailyReturn": None},
            }
        ]
    }
    result = await portfolio_live.apply_live_performance(dashboard)
    assert result["portfolios"][0]["performance"]["dailyReturn"] is None
