"""Account-scoped post-close DSA scheduling and notification delivery."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, or_, select

from deerflow.persistence.dsa.model import (
    DsaAutoResearchRunRow,
    DsaAutoResearchSettingRow,
    DsaAutoResearchSymbolRow,
    ZhihengNotificationRow,
)
from deerflow.persistence.dsa.repository import claim_task_in_session
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)

SHANGHAI = ZoneInfo("Asia/Shanghai")
MAX_SYMBOLS_PER_USER = 10
DEFAULT_MAX_INFLIGHT = 2
MAX_ATTEMPTS = 3
RUN_TIMEOUT = timedelta(hours=4)
RETRY_DELAY = timedelta(minutes=5)
_A_SHARE_RE = re.compile(r"^\d{6}$")


def normalize_a_share_symbol(value: str) -> str:
    """Return the canonical six-digit A-share code or raise ValueError."""
    symbol = str(value or "").strip().upper()
    for suffix in (".SH", ".SS", ".SZ", ".BJ"):
        if symbol.endswith(suffix):
            symbol = symbol[: -len(suffix)]
            break
    if len(symbol) == 8 and symbol[:2] in {"SH", "SZ", "BJ"}:
        symbol = symbol[2:]
    if not _A_SHARE_RE.fullmatch(symbol):
        raise ValueError(f"暂只支持 A 股六位代码：{value}")
    return symbol


def schedule_start_time() -> time:
    raw = os.getenv("DSA_AUTOMATION_START_TIME", "15:10").strip()
    try:
        hour_text, minute_text = raw.split(":", 1)
        return time(hour=int(hour_text), minute=int(minute_text))
    except (TypeError, ValueError):
        logger.warning("Invalid DSA_AUTOMATION_START_TIME=%r; using 15:10", raw)
        return time(hour=15, minute=10)


def is_schedule_window(now: datetime) -> bool:
    local = now.astimezone(SHANGHAI)
    return local.weekday() < 5 and local.time() >= schedule_start_time()


def quote_fallback_delay() -> timedelta:
    raw = os.getenv("DSA_AUTOMATION_QUOTE_FALLBACK_MINUTES", "5").strip()
    try:
        minutes = int(raw)
    except (TypeError, ValueError):
        logger.warning(
            "Invalid DSA_AUTOMATION_QUOTE_FALLBACK_MINUTES=%r; using 5",
            raw,
        )
        minutes = 5
    return timedelta(minutes=max(0, min(minutes, 60)))


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _same_price(left: float, right: float) -> bool:
    return math.isclose(left, right, rel_tol=0.0001, abs_tol=0.02)


def _quote_proves_new_session(quote: dict[str, Any], latest_bar: dict[str, Any]) -> bool:
    """Confirm that a quote belongs to the session after ``latest_bar``.

    The public quote endpoint stamps fetch time rather than provider time, so it
    cannot establish a trading day by itself. Cross-checking yesterday's close
    and requiring a different complete OHLCV snapshot rejects stale holiday
    quotes while still allowing delayed end-of-day bars to fall back safely.
    """
    quote_values = {
        "open": _number(quote.get("open")),
        "high": _number(quote.get("high")),
        "low": _number(quote.get("low")),
        "close": _number(quote.get("current_price")),
        "volume": _number(quote.get("volume")),
        "prev_close": _number(quote.get("prev_close")),
    }
    if any(value is None or value <= 0 for value in quote_values.values()):
        return False

    latest_values = {
        "open": _number(latest_bar.get("open")),
        "high": _number(latest_bar.get("high")),
        "low": _number(latest_bar.get("low")),
        "close": _number(latest_bar.get("close")),
        "volume": _number(latest_bar.get("volume")),
    }
    if any(value is None or value <= 0 for value in latest_values.values()):
        return False

    q_open = quote_values["open"]
    q_high = quote_values["high"]
    q_low = quote_values["low"]
    q_close = quote_values["close"]
    q_volume = quote_values["volume"]
    q_prev_close = quote_values["prev_close"]
    latest_close = latest_values["close"]
    assert all(
        value is not None
        for value in (q_open, q_high, q_low, q_close, q_volume, q_prev_close, latest_close)
    )

    if q_low > q_high or not (q_low - 0.02 <= q_open <= q_high + 0.02):
        return False
    if not (q_low - 0.02 <= q_close <= q_high + 0.02):
        return False
    if not _same_price(q_prev_close, latest_close):
        return False

    same_as_latest_bar = all(
        _same_price(quote_values[field], latest_values[field])
        for field in ("open", "high", "low", "close")
    ) and math.isclose(q_volume, latest_values["volume"], rel_tol=0.0001, abs_tol=1.0)
    return not same_as_latest_bar


def extract_dsa_summary(payload: dict[str, Any]) -> str:
    """Build a compact notification body from the DSA status result."""
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    report = result.get("report") if isinstance(result.get("report"), dict) else {}
    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    candidates = (
        summary.get("analysis_summary"),
        summary.get("operation_advice"),
        summary.get("action_label"),
        report.get("analysis_summary"),
        result.get("message"),
    )
    parts: list[str] = []
    for candidate in candidates:
        text_value = " ".join(str(candidate or "").split())
        if text_value and text_value not in parts:
            parts.append(text_value)
        if len(" · ".join(parts)) >= 220:
            break
    compact = " · ".join(parts) or "收盘研究已经完成，可进入关注列表查看最新结论。"
    return compact if len(compact) <= 240 else f"{compact[:239]}…"


def result_identity(payload: dict[str, Any], fallback_symbol: str) -> tuple[str | None, str, str]:
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    query_id = str(result.get("query_id") or "").strip() or None
    stock_name = str(result.get("stock_name") or payload.get("stock_name") or "").strip()
    stock_code = str(result.get("stock_code") or fallback_symbol).strip() or fallback_symbol
    return query_id, stock_name or stock_code, stock_code


class DsaAutomationService:
    """One durable scheduler tick; database constraints make ticks idempotent."""

    def __init__(self) -> None:
        self.base_url = os.getenv(
            "DSA_INTERNAL_API_URL",
            "http://stock-server:8000/api/v1",
        ).rstrip("/")
        self.max_inflight = max(
            1,
            min(int(os.getenv("DSA_AUTOMATION_MAX_INFLIGHT", str(DEFAULT_MAX_INFLIGHT))), 4),
        )

    async def tick(self, now: datetime | None = None) -> None:
        if get_session_factory() is None:
            return
        now_utc = (now or datetime.now(UTC)).astimezone(UTC)
        async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
            await self._poll_submitted(client, now_utc)
            if is_schedule_window(now_utc):
                await self._schedule_today(client, now_utc)
            await self._submit_pending(client, now_utc)

    async def _schedule_today(self, client: httpx.AsyncClient, now_utc: datetime) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        session_date = now_utc.astimezone(SHANGHAI).date()
        async with session_factory() as session:
            subscriptions = (
                await session.execute(
                    select(DsaAutoResearchSymbolRow.user_id, DsaAutoResearchSymbolRow.symbol)
                    .join(
                        DsaAutoResearchSettingRow,
                        DsaAutoResearchSettingRow.user_id == DsaAutoResearchSymbolRow.user_id,
                    )
                    .where(DsaAutoResearchSettingRow.enabled.is_(True))
                    .order_by(
                        DsaAutoResearchSymbolRow.user_id,
                        DsaAutoResearchSymbolRow.position,
                    )
                )
            ).all()
            existing = set(
                (
                    await session.execute(
                        select(DsaAutoResearchRunRow.user_id, DsaAutoResearchRunRow.symbol).where(
                            DsaAutoResearchRunRow.session_date == session_date,
                        )
                    )
                ).all()
            )
        subscriptions = [
            (user_id, symbol)
            for user_id, symbol in subscriptions
            if (user_id, symbol) not in existing
        ]
        if not subscriptions:
            return

        symbols = sorted({symbol for _, symbol in subscriptions})
        availability = await asyncio.gather(
            *(
                self._market_data_ready(client, symbol, session_date, now_utc)
                for symbol in symbols
            ),
        )
        ready_symbols = {
            symbol
            for symbol, (ready, _) in zip(symbols, availability, strict=True)
            if ready
        }
        if not ready_symbols:
            reasons = sorted({reason for _, reason in availability})
            logger.info(
                "DSA auto research waiting session=%s symbols=%d reasons=%s",
                session_date,
                len(symbols),
                ",".join(reasons),
            )
            return

        async with session_factory() as session, session.begin():
            for user_id, symbol in subscriptions:
                if symbol not in ready_symbols:
                    continue
                session.add(
                    DsaAutoResearchRunRow(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        symbol=symbol,
                        session_date=session_date,
                        status="pending",
                        created_at=now_utc,
                        updated_at=now_utc,
                    )
                )
        logger.info(
            "DSA auto research scheduled session=%s ready_symbols=%d subscribers=%d",
            session_date,
            len(ready_symbols),
            len(subscriptions),
        )

    async def _market_data_ready(
        self,
        client: httpx.AsyncClient,
        symbol: str,
        session_date: date,
        now_utc: datetime,
    ) -> tuple[bool, str]:
        try:
            response = await client.get(
                f"{self.base_url}/stocks/{symbol}/history",
                params={"period": "daily", "days": 5},
            )
            response.raise_for_status()
            data = response.json().get("data") or []
            dates = {str(item.get("date") or "")[:10] for item in data if isinstance(item, dict)}
            if session_date.isoformat() in dates:
                return True, "closed_bar"
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("DSA close-bar check failed symbol=%s error=%s", symbol, exc)
            return False, "history_unavailable"

        fallback_at = datetime.combine(
            session_date,
            schedule_start_time(),
            tzinfo=SHANGHAI,
        ) + quote_fallback_delay()
        if now_utc.astimezone(SHANGHAI) < fallback_at:
            return False, "waiting_for_closed_bar"

        dated_rows: list[tuple[date, dict[str, Any]]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            try:
                item_date = date.fromisoformat(str(item.get("date") or "")[:10])
            except ValueError:
                continue
            if item_date < session_date:
                dated_rows.append((item_date, item))
        if not dated_rows:
            return False, "history_unavailable"
        latest_date, latest_bar = max(dated_rows, key=lambda item: item[0])

        try:
            response = await client.get(f"{self.base_url}/stocks/{symbol}/quote")
            response.raise_for_status()
            quote = response.json()
            if not isinstance(quote, dict):
                return False, "quote_incomplete"
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("DSA quote fallback failed symbol=%s error=%s", symbol, exc)
            return False, "quote_unavailable"

        if not _quote_proves_new_session(quote, latest_bar):
            required = (
                quote.get("open"),
                quote.get("high"),
                quote.get("low"),
                quote.get("current_price"),
                quote.get("prev_close"),
                quote.get("volume"),
            )
            reason = (
                "quote_incomplete"
                if any((_number(value) or 0) <= 0 for value in required)
                else "quote_not_new_session"
            )
            return False, reason

        logger.warning(
            "DSA using verified quote fallback symbol=%s session=%s latest_bar=%s quote_time=%s",
            symbol,
            session_date,
            latest_date,
            quote.get("update_time") or "-",
        )
        return True, "quote_fallback"

    async def _poll_submitted(self, client: httpx.AsyncClient, now_utc: datetime) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session:
            runs = (
                await session.scalars(
                    select(DsaAutoResearchRunRow)
                    .where(DsaAutoResearchRunRow.status == "submitted")
                    .order_by(DsaAutoResearchRunRow.updated_at)
                    .limit(50)
                )
            ).all()
        for run in runs:
            if _elapsed(now_utc, run.updated_at) > RUN_TIMEOUT:
                await self._fail_run(run.id, "DSA 任务超过 4 小时未完成", now_utc)
                continue
            if not run.task_id:
                await self._retry_or_fail(run.id, "DSA 任务缺少 task_id", now_utc)
                continue
            try:
                response = await client.get(f"{self.base_url}/analysis/status/{run.task_id}")
                if response.status_code == 404:
                    await self._retry_or_fail(run.id, "DSA 任务状态已丢失", now_utc)
                    continue
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("DSA status poll failed run=%s error=%s", run.id, exc)
                continue

            status = str(payload.get("status") or "").lower()
            if status == "completed":
                await self._complete_run(run.id, payload, now_utc)
            elif status in {"failed", "cancelled"}:
                await self._retry_or_fail(
                    run.id,
                    str(payload.get("error") or f"DSA 任务状态为 {status}"),
                    now_utc,
                )

    async def _submit_pending(self, client: httpx.AsyncClient, now_utc: datetime) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session:
            inflight = int(
                await session.scalar(
                    select(func.count(DsaAutoResearchRunRow.id)).where(
                        DsaAutoResearchRunRow.status == "submitted"
                    )
                )
                or 0
            )
            slots = max(self.max_inflight - inflight, 0)
            if slots == 0:
                return
            runs = (
                await session.scalars(
                    select(DsaAutoResearchRunRow)
                    .where(
                        DsaAutoResearchRunRow.status == "pending",
                        or_(
                            DsaAutoResearchRunRow.next_attempt_at.is_(None),
                            DsaAutoResearchRunRow.next_attempt_at <= now_utc,
                        ),
                    )
                    .order_by(DsaAutoResearchRunRow.created_at, DsaAutoResearchRunRow.id)
                    .limit(slots)
                )
            ).all()
        for run in runs:
            await self._submit_run(client, run.id, run.symbol, now_utc)

    async def _submit_run(
        self,
        client: httpx.AsyncClient,
        run_id: str,
        symbol: str,
        now_utc: datetime,
    ) -> None:
        try:
            response = await client.post(
                f"{self.base_url}/analysis/analyze",
                json={
                    "stock_code": symbol,
                    "report_type": "detailed",
                    "force_refresh": True,
                    "async_mode": True,
                    "analysis_phase": "postmarket",
                    "selection_source": "manual",
                    "notify": False,
                    "report_language": "zh",
                },
            )
            payload = response.json()
            if response.status_code == 409:
                task_id = str(payload.get("existing_task_id") or "").strip()
            else:
                response.raise_for_status()
                task_id = str(payload.get("task_id") or "").strip()
            if not task_id:
                raise ValueError("DSA 提交响应缺少 task_id")
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            await self._retry_or_fail(run_id, f"提交 DSA 失败：{exc}", now_utc)
            return

        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session, session.begin():
            run = await session.get(DsaAutoResearchRunRow, run_id)
            if run is None or run.status != "pending":
                return
            run.status = "submitted"
            run.task_id = task_id
            run.attempt_count += 1
            run.next_attempt_at = None
            run.last_error = None
            run.updated_at = now_utc
            await claim_task_in_session(
                session,
                user_id=run.user_id,
                task_id=task_id,
                stock_code=symbol,
            )
        logger.info("DSA auto research submitted run=%s symbol=%s task=%s", run_id, symbol, task_id)

    async def _complete_run(
        self,
        run_id: str,
        payload: dict[str, Any],
        now_utc: datetime,
    ) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session, session.begin():
            run = await session.get(DsaAutoResearchRunRow, run_id)
            if run is None or run.status == "completed":
                return
            query_id, display_name, stock_code = result_identity(payload, run.symbol)
            summary = extract_dsa_summary(payload)
            run.status = "completed"
            run.query_id = query_id
            run.stock_name = display_name
            run.summary = summary
            run.last_error = None
            run.completed_at = now_utc
            run.updated_at = now_utc
            if run.task_id:
                await claim_task_in_session(
                    session,
                    user_id=run.user_id,
                    task_id=run.task_id,
                    query_id=query_id,
                    stock_code=stock_code,
                    stock_name=display_name,
                )
            await self._add_notification(
                session,
                user_id=run.user_id,
                kind="dsa_research",
                severity="normal",
                symbol=stock_code,
                title=f"{display_name} 收盘 DSA 研究已完成",
                body=summary,
                target_url=f"/workspace/watchlist?{urlencode({'symbol': stock_code, 'report': query_id or ''})}",
                event_key=f"dsa:{run.session_date.isoformat()}:{run.symbol}",
                now_utc=now_utc,
            )
        logger.info("DSA auto research completed run=%s query=%s", run_id, query_id or "-")

    async def _retry_or_fail(self, run_id: str, error: str, now_utc: datetime) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session, session.begin():
            run = await session.get(DsaAutoResearchRunRow, run_id)
            if run is None or run.status in {"completed", "failed"}:
                return
            if run.attempt_count >= MAX_ATTEMPTS:
                await self._set_failed(session, run, error, now_utc)
                return
            run.status = "pending"
            run.task_id = None
            run.last_error = error[:2000]
            run.next_attempt_at = now_utc + RETRY_DELAY
            run.updated_at = now_utc

    async def _fail_run(self, run_id: str, error: str, now_utc: datetime) -> None:
        session_factory = get_session_factory()
        if session_factory is None:
            return
        async with session_factory() as session, session.begin():
            run = await session.get(DsaAutoResearchRunRow, run_id)
            if run is None or run.status in {"completed", "failed"}:
                return
            await self._set_failed(session, run, error, now_utc)

    async def _set_failed(self, session, run, error: str, now_utc: datetime) -> None:
        run.status = "failed"
        run.last_error = error[:2000]
        run.completed_at = now_utc
        run.updated_at = now_utc
        await self._add_notification(
            session,
            user_id=run.user_id,
            kind="dsa_research_failed",
            severity="important",
            symbol=run.symbol,
            title=f"{run.symbol} 自动 DSA 研究未完成",
            body=f"今日任务已停止重试：{error[:220]}",
            target_url="/workspace/watchlist",
            event_key=f"dsa-failed:{run.session_date.isoformat()}:{run.symbol}",
            now_utc=now_utc,
        )

    @staticmethod
    async def _add_notification(
        session,
        *,
        user_id: str,
        kind: str,
        severity: str,
        symbol: str | None,
        title: str,
        body: str,
        target_url: str | None,
        event_key: str,
        now_utc: datetime,
    ) -> None:
        existing = await session.scalar(
            select(ZhihengNotificationRow.id).where(
                ZhihengNotificationRow.user_id == user_id,
                ZhihengNotificationRow.event_key == event_key,
            )
        )
        if existing is not None:
            return
        session.add(
            ZhihengNotificationRow(
                id=str(uuid.uuid4()),
                user_id=user_id,
                kind=kind,
                severity=severity,
                symbol=symbol,
                title=title,
                body=body,
                target_url=target_url,
                event_key=event_key,
                created_at=now_utc,
            )
        )


def _elapsed(now_utc: datetime, value: datetime) -> timedelta:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return now_utc - value.astimezone(UTC)


async def run_dsa_automation_loop() -> None:
    """Run durable DSA ticks until the gateway shuts down."""
    service = DsaAutomationService()
    poll_seconds = max(30, min(int(os.getenv("DSA_AUTOMATION_POLL_SECONDS", "60")), 300))
    logger.info(
        "DSA automation loop started start=%s max_inflight=%d poll=%ds",
        schedule_start_time().strftime("%H:%M"),
        service.max_inflight,
        poll_seconds,
    )
    while True:
        try:
            await service.tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("DSA automation tick failed")
        await asyncio.sleep(poll_seconds)
