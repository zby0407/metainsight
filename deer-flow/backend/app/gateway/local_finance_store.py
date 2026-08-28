"""Standalone portfolio store used when the external finance-api is not configured."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from deerflow.config.runtime_paths import runtime_home

logger = logging.getLogger(__name__)
_LOCK = Lock()

WATCHLIST_LINK_KEY = "watchlist-auto-link"
WATCHLIST_PORTFOLIO_NAME = "自选组合"
WATCHLIST_PORTFOLIO_PURPOSE = "与自选列表自动同步，默认仅关注不记仓"


def finance_bridge_configured() -> bool:
    return bool(os.getenv("DEERFLOW_FINANCE_BRIDGE_SECRET", "").strip())


def load_dashboard(
    user_id: str,
    *,
    watchlist_symbols: list[str] | None = None,
) -> dict[str, Any]:
    if watchlist_symbols is not None:
        return sync_watchlist_portfolio(user_id, watchlist_symbols)
    with _LOCK:
        payload = _read_payload(user_id)
        if _ensure_items(payload):
            _write_payload(user_id, payload)
        items = payload["portfolios"]
        return {
            "summary": _summary(items),
            "portfolios": items,
        }


def sync_watchlist_portfolio(
    user_id: str,
    symbols: list[str],
    *,
    names: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Keep a dedicated 自选组合 in sync with the user's watchlist codes."""
    names = names or {}
    seen: list[str] = []
    for raw in symbols:
        symbol = str(raw or "").strip().upper()
        if symbol and symbol not in seen:
            seen.append(symbol)

    with _LOCK:
        payload = _read_payload(user_id)
        linked = _find_watchlist_item(payload["portfolios"])
        if not seen and linked is None:
            if _ensure_items(payload):
                _write_payload(user_id, payload)
            items = payload["portfolios"]
            return {"summary": _summary(items), "portfolios": items}
        if linked is None:
            linked = _empty_watchlist_item()
            payload["portfolios"].insert(0, linked)
            payload["idempotency"][WATCHLIST_LINK_KEY] = linked["portfolio"]["id"]
        elif _watchlist_symbols_of(linked) == seen:
            if _ensure_items(payload):
                _write_payload(user_id, payload)
            items = payload["portfolios"]
            return {"summary": _summary(items), "portfolios": items}
        _apply_watchlist_symbols(linked, seen, names)
        others = [item for item in payload["portfolios"] if item is not linked]
        payload["portfolios"] = [linked, *others]
        _ensure_items(payload)
        _write_payload(user_id, payload)
        return {
            "summary": _summary(payload["portfolios"]),
            "portfolios": payload["portfolios"],
        }


def try_sync_watchlist_portfolio(user_id: str, symbols: list[str]) -> None:
    """Best-effort watchlist sync; never fail the originating request."""
    if finance_bridge_configured():
        return
    try:
        sync_watchlist_portfolio(user_id, symbols)
    except Exception:
        logger.warning("Failed to sync watchlist into local portfolio store", exc_info=True)


def get_item(user_id: str, portfolio_id: str) -> dict[str, Any] | None:
    wanted = str(portfolio_id or "").strip()
    if not wanted:
        return None
    for item in _read_items(user_id):
        if str(item.get("portfolio", {}).get("id") or "") == wanted:
            return item
    return None


def save_latest_review(
    user_id: str,
    portfolio_id: str,
    review: dict[str, Any],
) -> dict[str, Any] | None:
    wanted = str(portfolio_id or "").strip()
    if not wanted:
        return None
    with _LOCK:
        payload = _read_payload(user_id)
        for item in payload["portfolios"]:
            if str(item.get("portfolio", {}).get("id") or "") != wanted:
                continue
            item["latestReview"] = review
            item["portfolio"]["updatedAt"] = _now()
            _write_payload(user_id, payload)
            return item
    return None


def complete_setup(user_id: str, setup: dict[str, Any]) -> dict[str, Any]:
    key = str(setup.get("idempotencyKey") or "").strip()
    if not key:
        raise ValueError("idempotencyKey is required")

    with _LOCK:
        payload = _read_payload(user_id)
        existing_id = payload["idempotency"].get(key)
        if existing_id:
            item = next(
                (row for row in payload["portfolios"] if row["portfolio"]["id"] == existing_id),
                None,
            )
            if item is not None:
                return _setup_response(item, idempotent=True)

        item = _build_item(setup)
        payload["portfolios"].append(item)
        payload["idempotency"][key] = item["portfolio"]["id"]
        _write_payload(user_id, payload)
        return _setup_response(item, idempotent=False)


def _store_dir() -> Path:
    path = runtime_home() / "local_finance"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _user_file(user_id: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in user_id)
    return _store_dir() / f"{safe}.json"


def _read_payload(user_id: str) -> dict[str, Any]:
    path = _user_file(user_id)
    if not path.exists():
        return {"portfolios": [], "idempotency": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"portfolios": [], "idempotency": {}}
    if not isinstance(data, dict):
        return {"portfolios": [], "idempotency": {}}
    portfolios = data.get("portfolios")
    idempotency = data.get("idempotency")
    return {
        "portfolios": portfolios if isinstance(portfolios, list) else [],
        "idempotency": idempotency if isinstance(idempotency, dict) else {},
    }


def _read_items(user_id: str) -> list[dict[str, Any]]:
    with _LOCK:
        return list(_read_payload(user_id)["portfolios"])


def _write_payload(user_id: str, payload: dict[str, Any]) -> None:
    path = _user_file(user_id)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(path)


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, TypeError):
        return Decimal("0")


def _qty(value: Any) -> Decimal:
    return _money(value)


def _amount_str(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")


def _qty_str(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _build_item(setup: dict[str, Any]) -> dict[str, Any]:
    now = _now()
    portfolio_id = str(uuid4())
    portfolio_in = setup.get("portfolio") if isinstance(setup.get("portfolio"), dict) else {}
    account_in = setup.get("account") if isinstance(setup.get("account"), dict) else {}
    strategy_in = setup.get("strategy") if isinstance(setup.get("strategy"), dict) else None
    as_of = str(account_in.get("asOf") or now)
    source = str(account_in.get("source") or "manual")
    base_currency = str(portfolio_in.get("baseCurrency") or "CNY")

    positions: list[dict[str, Any]] = []
    holdings = Decimal("0")
    for raw in account_in.get("positions") or []:
        if not isinstance(raw, dict):
            continue
        quantity = _qty(raw.get("quantity"))
        cost = _money(raw.get("averageCost"))
        holdings += quantity * cost
        positions.append(
            {
                "id": str(uuid4()),
                "portfolioId": portfolio_id,
                "market": str(raw.get("market") or ""),
                "symbol": str(raw.get("symbol") or ""),
                "name": str(raw.get("name") or raw.get("symbol") or ""),
                "quantity": _qty_str(quantity),
                "averageCost": _amount_str(cost),
                "currency": str(raw.get("currency") or base_currency),
                "source": source,
                "asOf": as_of,
            }
        )

    cash_balances: list[dict[str, Any]] = []
    cash_value = Decimal("0")
    for raw in account_in.get("cashBalances") or []:
        if not isinstance(raw, dict):
            continue
        amount = _money(raw.get("amount"))
        cash_value += amount
        cash_balances.append(
            {
                "id": str(uuid4()),
                "portfolioId": portfolio_id,
                "currency": str(raw.get("currency") or base_currency),
                "amount": _amount_str(amount),
                "source": source,
                "asOf": as_of,
            }
        )

    strategy = None
    if strategy_in:
        strategy = {
            "id": str(uuid4()),
            "portfolioId": portfolio_id,
            "version": 1,
            "status": "active" if strategy_in.get("activate", True) else "draft",
            "objective": str(strategy_in.get("objective") or ""),
            "horizon": str(strategy_in.get("horizon") or ""),
            "benchmark": strategy_in.get("benchmark"),
            "policy": strategy_in.get("policy") if isinstance(strategy_in.get("policy"), dict) else {},
            "createdFromId": None,
            "approvedAt": now if strategy_in.get("activate", True) else None,
            "effectiveFrom": now if strategy_in.get("activate", True) else None,
            "retiredAt": None,
            "createdAt": now,
            "updatedAt": now,
        }

    snapshot = None
    if setup.get("captureSnapshot", True):
        equity = holdings + cash_value
        snapshot = {
            "id": str(uuid4()),
            "portfolioId": portfolio_id,
            "strategyVersionId": strategy["id"] if strategy else None,
            "sessionDate": as_of[:10],
            "dataRevision": 1,
            "portfolioRevision": 1,
            "status": "final",
            "baseCurrency": base_currency,
            "holdingsValue": _amount_str(holdings),
            "cashValue": _amount_str(cash_value),
            "totalEquity": _amount_str(equity),
            "inputHash": "local",
            "marketDataHash": "local",
            "snapshotHash": "local",
            "formulaVersion": "local-v1",
            "payload": {},
            "dataGaps": [],
            "dataCutoff": as_of,
            "createdAt": now,
        }

    item = {
        "portfolio": {
            "id": portfolio_id,
            "name": str(portfolio_in.get("name") or "未命名组合"),
            "purpose": str(portfolio_in.get("purpose") or ""),
            "baseCurrency": base_currency,
            "benchmark": portfolio_in.get("benchmark"),
            "status": "active",
            "revision": 1,
            "createdAt": now,
            "updatedAt": now,
            "archivedAt": None,
        },
        "strategyCount": 1 if strategy else 0,
        "activeStrategy": strategy if strategy and strategy["status"] == "active" else None,
        "positions": positions,
        "cashBalances": cash_balances,
        "latestSnapshot": snapshot,
        "latestReview": None,
        "workspaceBriefs": None,
        "performance": {
            "status": "insufficient_data",
            "periodStart": None,
            "periodEnd": None,
            "snapshotCount": 1 if snapshot else 0,
            "returnIntervalCount": 0,
            "dailyReturn": None,
            "dailyPnl": None,
            "cumulativeReturn": None,
            "maxDrawdown": None,
            "annualizedVolatility": None,
            "unrealizedPnl": None,
            "unrealizedReturn": None,
            "cashWeight": None,
            "dataGaps": [],
        },
    }
    _ensure_opening_workspace(item)
    return item


def _summary(items: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "portfolioCount": len(items),
        "activeCount": sum(
            1 for item in items if item.get("portfolio", {}).get("status") == "active"
        ),
        "withStrategyCount": sum(1 for item in items if item.get("activeStrategy")),
        "withSnapshotCount": sum(1 for item in items if item.get("latestSnapshot")),
    }


def _setup_response(item: dict[str, Any], *, idempotent: bool) -> dict[str, Any]:
    portfolio = item["portfolio"]
    return {
        "idempotentReplay": idempotent,
        "portfolio": portfolio,
        "account": {
            "portfolioId": portfolio["id"],
            "portfolioRevision": portfolio["revision"],
            "baseCurrency": portfolio["baseCurrency"],
            "positions": item["positions"],
            "cashBalances": item["cashBalances"],
        },
        "strategy": item.get("activeStrategy"),
        "snapshot": item.get("latestSnapshot"),
        "snapshotError": None,
    }


def _find_watchlist_item(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    for item in items:
        if item.get("watchlistLinked"):
            return item
        purpose = str(item.get("portfolio", {}).get("purpose") or "")
        if purpose in {WATCHLIST_LINK_KEY, WATCHLIST_PORTFOLIO_PURPOSE}:
            return item
    return None


def _empty_watchlist_item() -> dict[str, Any]:
    now = _now()
    portfolio_id = str(uuid4())
    item = {
        "watchlistLinked": True,
        "portfolio": {
            "id": portfolio_id,
            "name": WATCHLIST_PORTFOLIO_NAME,
            "purpose": WATCHLIST_PORTFOLIO_PURPOSE,
            "baseCurrency": "CNY",
            "benchmark": None,
            "status": "active",
            "revision": 1,
            "createdAt": now,
            "updatedAt": now,
            "archivedAt": None,
        },
        "strategyCount": 0,
        "activeStrategy": None,
        "positions": [],
        "cashBalances": [],
        "latestSnapshot": None,
        "latestReview": None,
        "workspaceBriefs": None,
        "performance": {
            "status": "insufficient_data",
            "periodStart": None,
            "periodEnd": None,
            "snapshotCount": 0,
            "returnIntervalCount": 0,
            "dailyReturn": None,
            "dailyPnl": None,
            "cumulativeReturn": None,
            "maxDrawdown": None,
            "annualizedVolatility": None,
            "unrealizedPnl": None,
            "unrealizedReturn": None,
            "cashWeight": None,
            "dataGaps": ["watchlist_positions_have_no_size"],
        },
    }
    return item


def _market_for_symbol(symbol: str) -> str:
    if symbol.isdigit() and len(symbol) == 6:
        return "CN"
    if symbol.endswith(".HK") or (symbol.isdigit() and len(symbol) == 5):
        return "HK"
    return "CN"


def _watchlist_position(
    portfolio_id: str,
    symbol: str,
    names: dict[str, str],
    as_of: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid4()),
        "portfolioId": portfolio_id,
        "market": _market_for_symbol(symbol),
        "symbol": symbol,
        "name": names.get(symbol) or symbol,
        "quantity": "0",
        "averageCost": "0",
        "currency": "CNY",
        "source": "watchlist",
        "asOf": as_of,
    }


def _apply_watchlist_symbols(
    item: dict[str, Any],
    symbols: list[str],
    names: dict[str, str],
) -> None:
    now = _now()
    portfolio_id = str(item["portfolio"]["id"])
    existing = [
        position
        for position in item.get("positions") or []
        if isinstance(position, dict)
    ]
    by_symbol = {
        str(position.get("symbol") or "").upper(): position
        for position in existing
        if position.get("source") == "watchlist"
    }
    kept_manual = [
        position
        for position in existing
        if position.get("source") != "watchlist"
    ]
    synced: list[dict[str, Any]] = []
    for symbol in symbols:
        current = by_symbol.get(symbol)
        if current is None:
            synced.append(_watchlist_position(portfolio_id, symbol, names, now))
            continue
        if names.get(symbol) and current.get("name") in {None, "", symbol}:
            current["name"] = names[symbol]
        current["asOf"] = now
        synced.append(current)
    item["watchlistLinked"] = True
    item["positions"] = synced + kept_manual
    item["portfolio"]["name"] = WATCHLIST_PORTFOLIO_NAME
    item["portfolio"]["purpose"] = WATCHLIST_PORTFOLIO_PURPOSE
    item["portfolio"]["updatedAt"] = now
    item["portfolio"]["revision"] = int(item["portfolio"].get("revision") or 1) + 1
    _refresh_holdings_snapshot(item, now)


def _watchlist_symbols_of(item: dict[str, Any]) -> list[str]:
    symbols: list[str] = []
    for position in item.get("positions") or []:
        if not isinstance(position, dict) or position.get("source") != "watchlist":
            continue
        symbol = str(position.get("symbol") or "").strip().upper()
        if symbol:
            symbols.append(symbol)
    return symbols


def _refresh_holdings_snapshot(item: dict[str, Any], now: str) -> None:
    holdings = Decimal("0")
    for position in item.get("positions") or []:
        holdings += _qty(position.get("quantity")) * _money(position.get("averageCost"))
    cash_value = Decimal("0")
    for cash in item.get("cashBalances") or []:
        cash_value += _money(cash.get("amount"))
    equity = holdings + cash_value
    base_currency = str(item["portfolio"].get("baseCurrency") or "CNY")
    snapshot = item.get("latestSnapshot") if isinstance(item.get("latestSnapshot"), dict) else {}
    item["latestSnapshot"] = {
        **snapshot,
        "id": snapshot.get("id") or str(uuid4()),
        "portfolioId": item["portfolio"]["id"],
        "strategyVersionId": snapshot.get("strategyVersionId"),
        "sessionDate": now[:10],
        "dataRevision": int(snapshot.get("dataRevision") or 0) + 1,
        "portfolioRevision": item["portfolio"]["revision"],
        "status": "partial",
        "baseCurrency": base_currency,
        "holdingsValue": _amount_str(holdings),
        "cashValue": _amount_str(cash_value),
        "totalEquity": _amount_str(equity),
        "inputHash": snapshot.get("inputHash") or "watchlist",
        "marketDataHash": snapshot.get("marketDataHash") or "watchlist",
        "snapshotHash": "watchlist",
        "formulaVersion": snapshot.get("formulaVersion") or "local-v1",
        "payload": snapshot.get("payload") if isinstance(snapshot.get("payload"), dict) else {},
        "dataGaps": ["watchlist_positions_have_no_size"],
        "dataCutoff": now,
        "createdAt": now,
    }


def _ensure_items(payload: dict[str, Any]) -> bool:
    dirty = False
    for item in payload.get("portfolios") or []:
        if isinstance(item, dict) and _ensure_opening_workspace(item):
            dirty = True
    return dirty


def _ensure_opening_workspace(item: dict[str, Any]) -> bool:
    dirty = False
    snapshot = item.get("latestSnapshot") if isinstance(item.get("latestSnapshot"), dict) else {}
    cash_value = _money(snapshot.get("cashValue"))
    if cash_value == 0:
        for cash in item.get("cashBalances") or []:
            if isinstance(cash, dict):
                cash_value += _money(cash.get("amount"))
    holdings_value = _money(snapshot.get("holdingsValue"))
    equity = _money(snapshot.get("totalEquity"))
    if equity == 0:
        equity = holdings_value + cash_value

    for cash in item.get("cashBalances") or []:
        if not isinstance(cash, dict):
            continue
        formatted = _amount_str(_money(cash.get("amount")))
        if cash.get("amount") != formatted:
            cash["amount"] = formatted
            dirty = True

    performance = item.get("performance") if isinstance(item.get("performance"), dict) else None
    if performance is None:
        item["performance"] = {
            "status": "insufficient_data",
            "periodStart": None,
            "periodEnd": None,
            "snapshotCount": 1 if snapshot else 0,
            "returnIntervalCount": 0,
            "dailyReturn": None,
            "dailyPnl": None,
            "cumulativeReturn": None,
            "maxDrawdown": None,
            "annualizedVolatility": None,
            "unrealizedPnl": None,
            "unrealizedReturn": None,
            "cashWeight": None,
            "dataGaps": [],
        }
        performance = item["performance"]
        dirty = True
    if performance.get("cashWeight") is None and equity > 0:
        performance["cashWeight"] = format((cash_value / equity).quantize(Decimal("0.0001")), "f")
        dirty = True
    if performance.get("unrealizedReturn") is None and holdings_value == 0:
        performance["unrealizedReturn"] = "0"
        dirty = True

    if not isinstance(item.get("latestReview"), dict):
        item["latestReview"] = _build_opening_review(item, cash_value, holdings_value, equity)
        dirty = True
    briefs = item.get("workspaceBriefs")
    if not isinstance(briefs, dict) or not briefs.get("risk") or not briefs.get("strategy") or not briefs.get("sandbox"):
        item["workspaceBriefs"] = _build_opening_briefs(item, cash_value, holdings_value, equity)
        dirty = True
    return dirty


def _sized_positions(item: dict[str, Any]) -> list[dict[str, Any]]:
    sized: list[dict[str, Any]] = []
    for position in item.get("positions") or []:
        if isinstance(position, dict) and _qty(position.get("quantity")) > 0:
            sized.append(position)
    return sized


def _strategy_label(item: dict[str, Any]) -> str:
    strategy = item.get("activeStrategy") if isinstance(item.get("activeStrategy"), dict) else {}
    objective = str(strategy.get("objective") or "").strip()
    horizon = str(strategy.get("horizon") or "").strip()
    if objective and horizon:
        return f"{objective}，期限 {horizon}"
    if objective:
        return objective
    return ""


def _build_opening_review(
    item: dict[str, Any],
    cash_value: Decimal,
    holdings_value: Decimal,
    equity: Decimal,
) -> dict[str, Any]:
    now = _now()
    portfolio = item.get("portfolio") if isinstance(item.get("portfolio"), dict) else {}
    currency = str(portfolio.get("baseCurrency") or "CNY")
    name = str(portfolio.get("name") or "未命名组合")
    sized = _sized_positions(item)
    watchlist = bool(item.get("watchlistLinked"))
    strategy_text = _strategy_label(item)
    snapshot = item.get("latestSnapshot") if isinstance(item.get("latestSnapshot"), dict) else {}

    if watchlist and not sized:
        assessment = "insufficient_data"
        summary = (
            f"组合「{name}」已与自选列表同步，当前按观察仓处理，不记数量。"
            f"关注标的 {len(item.get('positions') or [])} 只，持仓市值与现金均为 0.00 {currency}。"
            "因没有记仓规模，无法计算收益率、回撤与集中度。"
            "建议新建投资组合并填写数量、成本与现金，或在本组合补齐记仓后再运行今日复盘。"
        )
    elif not sized:
        assessment = "watch"
        summary = (
            f"组合「{name}」已建立。"
            f"当前总权益 {_amount_str(equity)} {currency}，全部为现金，暂无股票持仓。"
            + (f"已激活策略：{strategy_text}。" if strategy_text else "尚未激活策略版本。")
            + "因仅有建仓当日快照，收益率、回撤与波动率尚无法计算。"
            "建议补齐计划持仓后运行今日复盘，或先做风险检查与沙盘推演。"
        )
    else:
        names = "、".join(
            f"{row.get('name') or row.get('symbol')} { _qty_str(_qty(row.get('quantity'))) }股"
            for row in sized[:6]
        )
        assessment = "on_track"
        summary = (
            f"组合「{name}」已建立。"
            f"当前总权益 {_amount_str(equity)} {currency}，其中持仓成本 {_amount_str(holdings_value)} {currency}，现金 {_amount_str(cash_value)} {currency}。"
            f"已记仓 {len(sized)} 只：{names}。"
            + (f"已激活策略：{strategy_text}。" if strategy_text else "尚未激活策略版本。")
            + "因仅有建仓当日快照，收益率、回撤与波动率将在后续交易日积累。"
            "可直接运行今日复盘、风险检查或沙盘推演。"
        )

    strategy_id = (item.get("activeStrategy") or {}).get("id") if isinstance(item.get("activeStrategy"), dict) else None
    return {
        "id": str(uuid4()),
        "portfolioId": portfolio.get("id"),
        "strategyVersionId": strategy_id or str(uuid4()),
        "reviewDate": now[:10],
        "status": "published",
        "assessment": assessment,
        "revision": 1,
        "summary": summary,
        "payload": {"kind": "opening"},
        "evidenceIds": [],
        "dataCutoff": snapshot.get("dataCutoff") or now,
        "inputSnapshotHash": snapshot.get("snapshotHash") or "local",
        "createdAt": now,
        "updatedAt": now,
        "publishedAt": now,
    }


def _build_opening_briefs(
    item: dict[str, Any],
    cash_value: Decimal,
    holdings_value: Decimal,
    equity: Decimal,
) -> dict[str, str]:
    portfolio = item.get("portfolio") if isinstance(item.get("portfolio"), dict) else {}
    currency = str(portfolio.get("baseCurrency") or "CNY")
    sized = _sized_positions(item)
    watchlist = bool(item.get("watchlistLinked"))
    strategy_text = _strategy_label(item)
    cash_weight = "100%" if equity > 0 and cash_value == equity else (
        f"{(cash_value / equity * 100).quantize(Decimal('0.01'))}%" if equity > 0 else "—"
    )

    if watchlist and not sized:
        risk = (
            "当前为观察仓，股票与现金敞口均为零，无法度量市场风险。"
            "缺少单票上限、止损线和再平衡规则。"
            "优先处理：转为记仓组合，录入数量、成本与现金后再做风险检查。"
        )
        strategy = (
            "观察仓没有激活策略版本，后续优化缺少约束基准。"
            "建议先建立带目标与期限的投资组合，再迭代策略。"
        )
        sandbox = (
            "当前快照没有可模拟的持仓或现金。"
            "建议用新建组合的建仓快照作为沙盘起点，对比保持现金与按计划建仓。"
        )
    elif not sized:
        risk = (
            f"当前无股票敞口，实质市场风险为零，现金 {_amount_str(cash_value)} {currency} 全部闲置。"
            "资金效率偏低，且尚未约定单票上限、止损线与再平衡规则。"
            "优先处理：录入计划持仓，并补齐基础风控约束。"
        )
        strategy = (
            (f"已记录策略：{strategy_text}。" if strategy_text else "尚未填写策略目标。")
            + ("当前无对比基准，后续归因缺少参照。" if not portfolio.get("benchmark") else f"对比基准为 {portfolio.get('benchmark')}。")
            + "建议在建仓前明确仓位与回撤约束，再运行策略优化。"
        )
        sandbox = (
            f"已具备建仓快照，总权益 {_amount_str(equity)} {currency}，现金占比 {cash_weight}。"
            "当前为现金组合，模拟分支需先设定目标持仓才有判别力。"
            "建议克隆本快照后，对比「保持现金」与「按计划建仓」两条路径。"
        )
    else:
        risk = (
            f"已记仓 {len(sized)} 只，持仓成本 {_amount_str(holdings_value)} {currency}，现金占比 {cash_weight}。"
            "尚无市价重估，集中度与回撤需结合后续行情。"
            "优先处理：核对单票权重，补齐止损与再平衡规则。"
        )
        strategy = (
            (f"已激活策略：{strategy_text}。" if strategy_text else "尚未激活策略版本。")
            + "建仓基线已形成，可将本次持仓与目标权重对照后再优化。"
        )
        sandbox = (
            f"已具备含持仓的建仓快照，总权益 {_amount_str(equity)} {currency}。"
            "可从当前快照克隆隔离环境，观察加仓、减仓或再平衡分支。"
        )

    return {"risk": risk, "strategy": strategy, "sandbox": sandbox}
