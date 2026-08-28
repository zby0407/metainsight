"""Mark local portfolios to market using live DSA quotes."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import statistics
import time
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.gateway.local_finance_store import _amount_str, _money, _qty

logger = logging.getLogger(__name__)

_QUOTE_TTL_SECONDS = 15.0
_HISTORY_TTL_SECONDS = 300.0
_HISTORY_DAYS = 60
_TIMEOUT = httpx.Timeout(12.0, connect=2.0)
_STALE_GAPS = {"mark_to_market_uses_cost_basis"}

_quote_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_history_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _dsa_base_url() -> str:
    return os.getenv(
        "DSA_INTERNAL_API_URL",
        "http://stock-server:8000/api/v1",
    ).rstrip("/")


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _number(value: Any) -> Decimal | None:
    if value in (None, "", "-"):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not amount.is_finite():
        return None
    return amount


def _ratio_str(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.0001")), "f")


def _unwrap_quote(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    return payload


def _quote_price(quote: dict[str, Any]) -> Decimal | None:
    for key in (
        "current_price",
        "current",
        "last_price",
        "last",
        "price",
        "close",
    ):
        price = _number(quote.get(key))
        if price is not None and price > 0:
            return price
    return None


def _prev_close(quote: dict[str, Any], last: Decimal) -> Decimal | None:
    prev = _number(quote.get("prev_close"))
    if prev is not None and prev > 0:
        return prev
    change = _number(quote.get("change"))
    if change is not None:
        prev = last - change
        if prev > 0:
            return prev
    pct = _number(
        quote.get("change_percent")
        if quote.get("change_percent") is not None
        else quote.get("change_pct")
    )
    if pct is None:
        return None
    # DSA quotes store change_percent in percentage points, e.g. -1.23.
    denom = Decimal("1") + (pct / Decimal("100"))
    if denom <= 0:
        return None
    prev = (last / denom).quantize(Decimal("0.0001"))
    return prev if prev > 0 else None


def _history_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        data = payload.get("data")
        rows = data if isinstance(data, list) else []
    else:
        rows = []
    cleaned: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        day = str(row.get("date") or "")[:10]
        close = _number(row.get("close") or row.get("Close"))
        if len(day) == 10 and close is not None and close > 0:
            cleaned.append({"date": day, "close": close})
    cleaned.sort(key=lambda item: item["date"])
    return cleaned


def _sized_positions(item: dict[str, Any]) -> list[dict[str, Any]]:
    sized: list[dict[str, Any]] = []
    for position in item.get("positions") or []:
        if isinstance(position, dict) and _qty(position.get("quantity")) > 0:
            sized.append(position)
    return sized


def _collect_symbols(items: list[dict[str, Any]]) -> list[str]:
    seen: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for position in _sized_positions(item):
            symbol = str(position.get("symbol") or "").strip().upper()
            if symbol and symbol not in seen:
                seen.append(symbol)
    return seen


async def _get_json(client: httpx.AsyncClient, path: str) -> Any | None:
    try:
        response = await client.get(path)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.debug("live market read failed path=%s err=%s", path, exc)
        return None


async def _fetch_quotes(symbols: list[str]) -> dict[str, dict[str, Any]]:
    now = time.monotonic()
    quotes: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    for symbol in symbols:
        cached = _quote_cache.get(symbol)
        if cached and now - cached[0] < _QUOTE_TTL_SECONDS:
            quotes[symbol] = cached[1]
        else:
            missing.append(symbol)
    if not missing:
        return quotes

    async with httpx.AsyncClient(
        base_url=_dsa_base_url(),
        timeout=_TIMEOUT,
        trust_env=False,
    ) as client:
        payloads = await _gather_json(
            client,
            [f"/stocks/{symbol}/quote" for symbol in missing],
        )

    fetched_at = time.monotonic()
    for symbol, payload in zip(missing, payloads, strict=False):
        quote = _unwrap_quote(payload)
        if quote is None or _quote_price(quote) is None:
            continue
        _quote_cache[symbol] = (fetched_at, quote)
        quotes[symbol] = quote
    return quotes


async def _fetch_histories(symbols: list[str]) -> dict[str, list[dict[str, Any]]]:
    now = time.monotonic()
    histories: dict[str, list[dict[str, Any]]] = {}
    missing: list[str] = []
    for symbol in symbols:
        cached = _history_cache.get(symbol)
        if cached and now - cached[0] < _HISTORY_TTL_SECONDS:
            histories[symbol] = cached[1]
        else:
            missing.append(symbol)
    if not missing:
        return histories

    async with httpx.AsyncClient(
        base_url=_dsa_base_url(),
        timeout=_TIMEOUT,
        trust_env=False,
    ) as client:
        payloads = await _gather_json(
            client,
            [
                f"/stocks/{symbol}/history?period=daily&days={_HISTORY_DAYS}"
                for symbol in missing
            ],
        )

    fetched_at = time.monotonic()
    for symbol, payload in zip(missing, payloads, strict=False):
        rows = _history_rows(payload)
        if len(rows) < 2:
            continue
        _history_cache[symbol] = (fetched_at, rows)
        histories[symbol] = rows
    return histories


async def _gather_json(client: httpx.AsyncClient, paths: list[str]) -> list[Any | None]:
    return list(await asyncio.gather(*[_get_json(client, path) for path in paths]))


def _apply_item(
    item: dict[str, Any],
    quotes: dict[str, dict[str, Any]],
    histories: dict[str, list[dict[str, Any]]],
) -> None:
    positions = _sized_positions(item)
    if not positions:
        return

    cash = Decimal("0")
    snapshot = item.get("latestSnapshot") if isinstance(item.get("latestSnapshot"), dict) else {}
    cash += _money(snapshot.get("cashValue"))
    if cash == 0:
        for row in item.get("cashBalances") or []:
            if isinstance(row, dict):
                cash += _money(row.get("amount"))

    cost = Decimal("0")
    live_holdings = Decimal("0")
    prev_holdings = Decimal("0")
    daily_ready = True
    missing: list[str] = []
    priced = 0

    for position in positions:
        symbol = str(position.get("symbol") or "").strip().upper()
        qty = _qty(position.get("quantity"))
        avg = _money(position.get("averageCost"))
        cost += qty * avg
        quote = quotes.get(symbol)
        price = _quote_price(quote) if quote else None
        if price is None:
            missing.append(symbol)
            daily_ready = False
            continue
        priced += 1
        live_holdings += qty * price
        prev = _prev_close(quote, price)
        if prev is None:
            daily_ready = False
        else:
            prev_holdings += qty * prev

    if priced == 0:
        return

    equity = live_holdings + cash
    prev_equity = prev_holdings + cash if daily_ready else None
    unrealized = live_holdings - cost if cost > 0 else None
    daily_pnl = (
        equity - prev_equity if prev_equity is not None else None
    )

    performance = item.get("performance") if isinstance(item.get("performance"), dict) else {}
    item["performance"] = performance
    performance["live"] = True
    performance["periodEnd"] = _now()[:10]
    gaps = [
        gap
        for gap in list(performance.get("dataGaps") or [])
        if gap not in missing and gap not in _STALE_GAPS
    ]
    if missing:
        gaps.extend(missing)
    performance["dataGaps"] = gaps

    if snapshot:
        snapshot["holdingsValue"] = _amount_str(live_holdings)
        snapshot["totalEquity"] = _amount_str(equity)
        snapshot["dataCutoff"] = _now()
        snapshot["marketDataHash"] = "live-quote"

    if cost > 0 and unrealized is not None:
        performance["unrealizedPnl"] = _amount_str(unrealized)
        performance["unrealizedReturn"] = _ratio_str(unrealized / cost)
    if equity > 0:
        performance["cashWeight"] = _ratio_str(cash / equity)
    if daily_pnl is not None:
        performance["dailyPnl"] = _amount_str(daily_pnl)
        if prev_equity and prev_equity > 0:
            performance["dailyReturn"] = _ratio_str(daily_pnl / prev_equity)

    _apply_history_risk(performance, positions, cash, histories)

    if performance.get("maxDrawdown") is not None and performance.get(
        "annualizedVolatility"
    ) is not None:
        performance["status"] = "complete"
    elif performance.get("unrealizedReturn") is not None or performance.get(
        "dailyReturn"
    ) is not None:
        performance["status"] = "partial"
    performance["snapshotCount"] = max(int(performance.get("snapshotCount") or 0), 1)


def _apply_history_risk(
    performance: dict[str, Any],
    positions: list[dict[str, Any]],
    cash: Decimal,
    histories: dict[str, list[dict[str, Any]]],
) -> None:
    series_by_symbol: dict[str, dict[str, Decimal]] = {}
    all_dates: set[str] = set()
    for position in positions:
        symbol = str(position.get("symbol") or "").strip().upper()
        rows = histories.get(symbol) or []
        if len(rows) < 2:
            return
        mapping = {str(row["date"]): row["close"] for row in rows}
        series_by_symbol[symbol] = mapping
        all_dates.update(mapping)
    if len(all_dates) < 5:
        return

    last_close: dict[str, Decimal] = {}
    equities: list[float] = []
    used_dates: list[str] = []
    for day in sorted(all_dates):
        complete = True
        market_value = Decimal("0")
        for position in positions:
            symbol = str(position.get("symbol") or "").strip().upper()
            if day in series_by_symbol[symbol]:
                last_close[symbol] = series_by_symbol[symbol][day]
            if symbol not in last_close:
                complete = False
                break
            market_value += _qty(position.get("quantity")) * last_close[symbol]
        if not complete:
            continue
        used_dates.append(day)
        equities.append(float(market_value + cash))
    if len(equities) < 5:
        return

    peak = equities[0]
    max_dd = 0.0
    returns: list[float] = []
    for index, equity in enumerate(equities):
        peak = max(peak, equity)
        if peak > 0:
            max_dd = min(max_dd, (equity - peak) / peak)
        if index > 0 and equities[index - 1] > 0:
            returns.append(equity / equities[index - 1] - 1)

    if peak > 0:
        performance["maxDrawdown"] = _ratio_str(Decimal(str(max_dd)))
        performance["periodStart"] = used_dates[0]
    if len(returns) >= 5:
        vol = statistics.stdev(returns) * math.sqrt(252)
        if math.isfinite(vol):
            performance["annualizedVolatility"] = _ratio_str(Decimal(str(vol)))
            performance["returnIntervalCount"] = len(returns)


async def apply_live_performance(dashboard: dict[str, Any]) -> dict[str, Any]:
    """Fill performance from live quotes. Fail open if the market service is down."""
    items = dashboard.get("portfolios")
    if not isinstance(items, list) or not items:
        return dashboard
    symbols = _collect_symbols(items)
    if not symbols:
        return dashboard
    try:
        quotes = await _fetch_quotes(symbols)
        if not quotes:
            return dashboard
        histories = await _fetch_histories(list(quotes))
    except Exception:
        logger.warning("Live portfolio mark-to-market failed", exc_info=True)
        return dashboard
    for item in items:
        if isinstance(item, dict):
            _apply_item(item, quotes, histories)
    return dashboard
