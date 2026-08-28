"""Scheduled market + policy digests delivered to the in-app notification inbox."""

from __future__ import annotations

import asyncio
import logging
import os
import time as pytime
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from deerflow.persistence.dsa.model import (
    DigestPushSettingRow,
    DsaAutoResearchRunRow,
    DsaAutoResearchSettingRow,
    ZhihengNotificationRow,
)
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)

SHANGHAI = ZoneInfo("Asia/Shanghai")
POLICY_KEYWORDS = (
    "政策",
    "国务院",
    "发改委",
    "央行",
    "证监会",
    "工信部",
    "财政部",
    "能源局",
    "监管",
    "宏观",
    "利率",
    "降准",
    "降息",
    "财政政策",
    "产业政策",
    "美联储",
    "征求意见",
    "管理办法",
    "预算",
    "专项债",
    "国债",
    "流动性",
    "印花税",
    "货币政策",
)

# Direct CN macro/policy feeds used when finance-api / intelligence are empty.
WALLSTREETCN_FLOW_URL = (
    "https://api-one-wscn.awtmt.com/apiv1/content/information-flow"
)
PEOPLE_POLITICS_RSS_URL = "http://www.people.com.cn/rss/politics.xml"
INDEX_SYMBOLS = (
    ("000001.SH", "上证指数"),
    ("399001.SZ", "深证成指"),
    ("399006.SZ", "创业板指"),
)
_SNAPSHOT_TTL_SEC = 45.0
_SNAPSHOT_CACHE: tuple[float, list[str], list[str]] | None = None
_SNAPSHOT_LOCK = asyncio.Lock()


def digest_start_time() -> time:
    raw = os.getenv("DIGEST_PUSH_START_TIME", "16:00").strip()
    try:
        hour_text, minute_text = raw.split(":", 1)
        return time(hour=int(hour_text), minute=int(minute_text))
    except (TypeError, ValueError):
        logger.warning("Invalid DIGEST_PUSH_START_TIME=%r; using 16:00", raw)
        return time(hour=16, minute=0)


def weekly_digest_weekday() -> int:
    """0=Monday … 6=Sunday. Default Friday."""
    raw = os.getenv("DIGEST_WEEKLY_WEEKDAY", "4").strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 4
    return max(0, min(value, 6))


def _dsa_base_url() -> str:
    return os.getenv(
        "DSA_INTERNAL_API_URL",
        "http://stock-server:8000/api/v1",
    ).rstrip("/")


def _news_base_url() -> str:
    return os.getenv(
        "FINANCE_NEWS_INTERNAL_API_URL",
        "http://finance-api:8000/api/news",
    ).rstrip("/")


def iso_week_period(day: date) -> str:
    iso = day.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def month_period(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def previous_month_period(day: date) -> str:
    first = day.replace(day=1)
    prev = first - timedelta(days=1)
    return month_period(prev)


def _compact(text: str, limit: int = 480) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[: limit - 1]}…"


def _fmt_pct(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "-"
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}%"


def _fmt_price(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value).strip() or "-"
    return f"{number:.2f}"


def _quote_field(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, "", "-"):
            return value
    return None


def _is_policy_item(title: str, summary: str = "") -> bool:
    blob = f"{title} {summary}"
    return any(keyword in blob for keyword in POLICY_KEYWORDS)


class DigestPushService:
    """Build and deliver day/week/month digests to Zhiheng notifications."""

    async def tick(self, now: datetime | None = None) -> None:
        if get_session_factory() is None:
            return
        now_utc = (now or datetime.now(UTC)).astimezone(UTC)
        local = now_utc.astimezone(SHANGHAI)
        if local.time() < digest_start_time():
            return

        await self._seed_subscribers()
        market_lines, policy_lines = await self._live_snapshot()
        await self._deliver_due_digests(
            now_utc=now_utc,
            local=local,
            market_lines=market_lines,
            policy_lines=policy_lines,
        )

    async def _seed_subscribers(self) -> None:
        """Ensure registered users have digest settings (defaults on)."""
        factory = get_session_factory()
        if factory is None:
            return
        now = datetime.now(UTC)
        async with factory() as session, session.begin():
            from sqlalchemy import text

            user_ids = set(
                (await session.execute(text("SELECT id FROM users"))).scalars().all()
            )
            auto_users = set(
                await session.scalars(
                    select(DsaAutoResearchSettingRow.user_id).where(
                        DsaAutoResearchSettingRow.enabled.is_(True)
                    )
                )
            )
            ensure_ids = user_ids | auto_users
            existing = set(await session.scalars(select(DigestPushSettingRow.user_id)))
            for user_id in ensure_ids - existing:
                session.add(DigestPushSettingRow(user_id=user_id, updated_at=now))

    async def _live_snapshot(self) -> tuple[list[str], list[str]]:
        """Shared market + policy snapshot, cached briefly for inbox polling."""
        global _SNAPSHOT_CACHE
        async with _SNAPSHOT_LOCK:
            now = pytime.monotonic()
            if _SNAPSHOT_CACHE and now - _SNAPSHOT_CACHE[0] < _SNAPSHOT_TTL_SEC:
                return _SNAPSHOT_CACHE[1], _SNAPSHOT_CACHE[2]
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(12.0, connect=4.0),
                trust_env=False,
            ) as client:
                market_lines = await self._fetch_market_snapshot(client)
                policy_lines = await self._fetch_policy_headlines(client)
            _SNAPSHOT_CACHE = (now, market_lines, policy_lines)
            return market_lines, policy_lines

    async def refresh_live_inbox(self, user_id: str) -> None:
        """Keep today's 政策与行情速递 aligned with the latest quotes."""
        if get_session_factory() is None:
            return
        now_utc = datetime.now(UTC)
        today = now_utc.astimezone(SHANGHAI).date()
        factory = get_session_factory()
        if factory is None:
            return
        async with factory() as session:
            settings = await session.get(DigestPushSettingRow, user_id)
            if settings is not None and not settings.daily_brief_enabled:
                return
        market_lines, policy_lines = await self._live_snapshot()
        body = (
            "【市场行情】"
            + "；".join(market_lines)
            + "\n【政策动态】"
            + "；".join(policy_lines)
        )
        if len(body) > 900:
            body = f"{body[:899]}…"
        async with factory() as session, session.begin():
            settings = await session.get(DigestPushSettingRow, user_id)
            if settings is None:
                settings = DigestPushSettingRow(user_id=user_id, updated_at=now_utc)
                session.add(settings)
            elif not settings.daily_brief_enabled:
                return
            await self._add_notification(
                session,
                user_id=user_id,
                kind="daily_brief",
                severity="normal",
                title=f"{today.isoformat()} 政策与行情速递",
                body=body,
                target_url="/workspace/market#policy",
                event_key=f"digest:daily-brief:{today.isoformat()}",
                now_utc=now_utc,
            )
            settings.updated_at = now_utc

    async def _fetch_market_snapshot(self, client: httpx.AsyncClient) -> list[str]:
        lines: list[str] = []
        for symbol, name in INDEX_SYMBOLS:
            try:
                response = await client.get(f"{_dsa_base_url()}/stocks/{symbol}/quote")
                response.raise_for_status()
                payload = response.json()
                data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
                if not isinstance(data, dict):
                    continue
                price = _quote_field(
                    data,
                    "current",
                    "current_price",
                    "last_price",
                    "last",
                    "price",
                    "close",
                )
                change_pct = _quote_field(
                    data,
                    "change_pct",
                    "percent",
                    "chg_pct",
                    "changePercent",
                    "pct_chg",
                )
                if price is None:
                    continue
                lines.append(f"{name} {_fmt_price(price)}（{_fmt_pct(change_pct)}）")
            except (httpx.HTTPError, ValueError, TypeError) as exc:
                logger.debug("digest market quote failed symbol=%s err=%s", symbol, exc)
        if not lines:
            lines.append("暂未能取到主要指数行情，请稍后打开市场总览查看。")
        return lines

    async def fetch_policy_headline_items(self) -> list[dict[str, str]]:
        """Structured policy/macro headlines for market page + digests."""
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=5.0),
            trust_env=False,
        ) as client:
            raw = await self._collect_policy_items(client)
        if not raw:
            return [
                {
                    "title": "今日暂未抓取到显著政策动态",
                    "summary": "数据源繁忙或休市，可稍后在热点资讯复核。",
                    "source": "MetaInsight",
                    "url": "/workspace/news",
                }
            ]
        items: list[dict[str, str]] = []
        seen: set[str] = set()
        for title, summary, source, url in raw:
            if title in seen:
                continue
            seen.add(title)
            items.append(
                {
                    "title": title,
                    "summary": _compact(summary, 160),
                    "source": source,
                    "url": url or "/workspace/news",
                }
            )
            if len(items) >= 8:
                break
        return items

    async def _fetch_policy_headlines(self, client: httpx.AsyncClient) -> list[str]:
        items = await self._collect_policy_items(client)
        if not items:
            return ["今日暂未抓取到显著政策动态（数据源繁忙或休市），可稍后在热点资讯复核。"]

        lines: list[str] = []
        seen: set[str] = set()
        for title, summary, _source, _url in items:
            if title in seen:
                continue
            seen.add(title)
            snippet = _compact(f"{title}" + (f"：{summary}" if summary else ""), 120)
            lines.append(snippet)
            if len(lines) >= 5:
                break
        return lines

    async def _collect_policy_items(
        self, client: httpx.AsyncClient
    ) -> list[tuple[str, str, str, str]]:
        """Return (title, summary, source, url) tuples."""
        items: list[tuple[str, str, str, str]] = []

        try:
            responses = await asyncio.gather(
                *(
                    client.get(
                        f"{_news_base_url()}/feed",
                        params={"channel": channel, "sort": "latest", "limit": 20},
                    )
                    for channel in ("general", "technology")
                ),
                return_exceptions=True,
            )
            for response in responses:
                if isinstance(response, BaseException):
                    continue
                response.raise_for_status()
                for event in response.json().get("items", []):
                    if not isinstance(event, dict):
                        continue
                    title = str(event.get("title") or "").strip()
                    summary = str(event.get("summary") or "").strip()
                    url = str(event.get("url") or event.get("link") or "").strip()
                    if title and _is_policy_item(title, summary):
                        items.append((title, summary, "资讯聚合", url))
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.debug("digest news feed unavailable: %s", exc)

        if not items:
            try:
                response = await client.get(
                    f"{_dsa_base_url()}/intelligence/items",
                    params={"limit": 30},
                )
                response.raise_for_status()
                payload = response.json()
                rows = payload.get("items") or payload.get("data") or []
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    title = str(row.get("title") or "").strip()
                    summary = str(row.get("summary") or row.get("snippet") or "").strip()
                    url = str(row.get("url") or row.get("link") or "").strip()
                    source = str(row.get("source") or "情报源").strip() or "情报源"
                    if title and _is_policy_item(title, summary):
                        items.append((title, summary, source, url))
            except (httpx.HTTPError, ValueError, TypeError) as exc:
                logger.debug("digest intelligence fallback failed: %s", exc)

        if not items:
            items.extend(await self._fetch_wallstreetcn_policy(client))

        if not items:
            items.extend(await self._fetch_people_politics_rss(client))

        return items

    async def _fetch_wallstreetcn_policy(
        self, client: httpx.AsyncClient
    ) -> list[tuple[str, str, str, str]]:
        try:
            response = await client.get(
                WALLSTREETCN_FLOW_URL,
                params={
                    "channel": "global-channel",
                    "limit": 40,
                    "accept": "article",
                    "action": "rank",
                },
                headers={"User-Agent": "MetaInsightDigest/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
            rows = (
                ((payload.get("data") or {}).get("items") if isinstance(payload, dict) else None)
                or []
            )
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.debug("digest wallstreetcn fallback failed: %s", exc)
            return []

        items: list[tuple[str, str, str, str]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            resource = row.get("resource") if isinstance(row.get("resource"), dict) else row
            title = str(resource.get("title") or "").strip()
            summary = str(
                resource.get("content_short")
                or resource.get("content_text")
                or resource.get("summary")
                or ""
            ).strip()
            article_id = resource.get("id") or resource.get("uri")
            url = str(resource.get("url") or resource.get("share_url") or "").strip()
            if not url and article_id:
                url = f"https://wallstreetcn.com/articles/{article_id}"
            if title and _is_policy_item(title, summary):
                items.append((title, summary, "华尔街见闻", url))
        return items

    async def _fetch_people_politics_rss(
        self, client: httpx.AsyncClient
    ) -> list[tuple[str, str, str, str]]:
        try:
            response = await client.get(
                PEOPLE_POLITICS_RSS_URL,
                headers={"User-Agent": "MetaInsightDigest/1.0"},
            )
            response.raise_for_status()
            text = response.text
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.debug("digest people politics rss failed: %s", exc)
            return []

        items: list[tuple[str, str, str, str]] = []
        # Minimal RSS title scrape (avoid adding an XML dependency in gateway).
        for chunk in text.split("<item>")[1:8]:
            start = chunk.find("<title>")
            end = chunk.find("</title>")
            if start < 0 or end < 0:
                continue
            title = (
                chunk[start + 7 : end]
                .replace("<![CDATA[", "")
                .replace("]]>", "")
                .strip()
            )
            link_start = chunk.find("<link>")
            link_end = chunk.find("</link>")
            url = (
                chunk[link_start + 6 : link_end].strip()
                if link_start >= 0 and link_end > link_start
                else ""
            )
            if title and _is_policy_item(title, ""):
                items.append((title, "", "人民网时政", url))
        return items

    async def _watchlist_research_lines(
        self,
        *,
        user_id: str,
        start: date,
        end: date,
    ) -> list[str]:
        factory = get_session_factory()
        if factory is None:
            return []
        async with factory() as session:
            runs = list(
                await session.scalars(
                    select(DsaAutoResearchRunRow)
                    .where(
                        DsaAutoResearchRunRow.user_id == user_id,
                        DsaAutoResearchRunRow.session_date >= start,
                        DsaAutoResearchRunRow.session_date <= end,
                        DsaAutoResearchRunRow.status == "completed",
                    )
                    .order_by(DsaAutoResearchRunRow.session_date.desc())
                    .limit(12)
                )
            )
        lines: list[str] = []
        for run in runs:
            name = run.stock_name or run.symbol
            summary = _compact(run.summary or "研究完成", 90)
            lines.append(f"{run.session_date.isoformat()} {name}：{summary}")
        return lines

    async def _deliver_due_digests(
        self,
        *,
        now_utc: datetime,
        local: datetime,
        market_lines: list[str],
        policy_lines: list[str],
    ) -> None:
        factory = get_session_factory()
        if factory is None:
            return
        today = local.date()
        week_key = iso_week_period(today)
        month_key = previous_month_period(today) if today.day == 1 else None

        async with factory() as session:
            user_ids = list(await session.scalars(select(DigestPushSettingRow.user_id)))

        for user_id in user_ids:
            try:
                await self._maybe_send_for_user(
                    user_id=user_id,
                    now_utc=now_utc,
                    today=today,
                    week_key=week_key,
                    month_key=month_key,
                    weekday=local.weekday(),
                    market_lines=market_lines,
                    policy_lines=policy_lines,
                )
            except Exception:
                logger.exception("digest push failed user=%s", user_id)

    async def _maybe_send_for_user(
        self,
        *,
        user_id: str,
        now_utc: datetime,
        today: date,
        week_key: str,
        month_key: str | None,
        weekday: int,
        market_lines: list[str],
        policy_lines: list[str],
    ) -> None:
        factory = get_session_factory()
        if factory is None:
            return

        daily_research: list[str] = []
        weekly_research: list[str] = []
        monthly_research: list[str] = []
        async with factory() as session:
            settings = await session.get(DigestPushSettingRow, user_id)
            if settings is None:
                return
            need_daily = (
                settings.daily_summary_enabled
                and weekday < 5
                and settings.last_daily_summary_on != today
            )
            need_weekly = (
                settings.weekly_summary_enabled
                and weekday == weekly_digest_weekday()
                and settings.last_weekly_period != week_key
            )
            need_monthly = (
                settings.monthly_summary_enabled
                and month_key is not None
                and settings.last_monthly_period != month_key
            )

        if need_daily:
            daily_research = await self._watchlist_research_lines(
                user_id=user_id, start=today, end=today
            )
        if need_weekly:
            week_start = today - timedelta(days=weekday)
            weekly_research = await self._watchlist_research_lines(
                user_id=user_id, start=week_start, end=today
            )
        if need_monthly and month_key is not None:
            year, month = map(int, month_key.split("-"))
            start = date(year, month, 1)
            if month == 12:
                end = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                end = date(year, month + 1, 1) - timedelta(days=1)
            monthly_research = await self._watchlist_research_lines(
                user_id=user_id, start=start, end=end
            )

        async with factory() as session, session.begin():
            settings = await session.get(DigestPushSettingRow, user_id)
            if settings is None:
                return

            if (
                settings.daily_brief_enabled
                and weekday < 5
                and settings.last_daily_brief_on != today
            ):
                body = (
                    "【市场行情】"
                    + "；".join(market_lines)
                    + "\n【政策动态】"
                    + "；".join(policy_lines)
                )
                if len(body) > 900:
                    body = f"{body[:899]}…"
                await self._add_notification(
                    session,
                    user_id=user_id,
                    kind="daily_brief",
                    severity="normal",
                    title=f"{today.isoformat()} 政策与行情速递",
                    body=body,
                    target_url="/workspace/market#policy",
                    event_key=f"digest:daily-brief:{today.isoformat()}",
                    now_utc=now_utc,
                )
                settings.last_daily_brief_on = today

            if (
                settings.daily_summary_enabled
                and weekday < 5
                and settings.last_daily_summary_on != today
            ):
                research_text = (
                    "；".join(daily_research)
                    if daily_research
                    else "今日暂无已完成的自选自动研究。"
                )
                body = (
                    "【日总结】"
                    + f"行情：{'；'.join(market_lines[:3])}。"
                    + f"政策：{'；'.join(policy_lines[:3])}。"
                    + f"自选研究：{research_text}"
                )
                if len(body) > 900:
                    body = f"{body[:899]}…"
                await self._add_notification(
                    session,
                    user_id=user_id,
                    kind="daily_summary",
                    severity="normal",
                    title=f"{today.isoformat()} 投研日总结",
                    body=body,
                    target_url="/workspace/market#policy",
                    event_key=f"digest:daily-summary:{today.isoformat()}",
                    now_utc=now_utc,
                )
                settings.last_daily_summary_on = today

            if (
                settings.weekly_summary_enabled
                and weekday == weekly_digest_weekday()
                and settings.last_weekly_period != week_key
            ):
                week_start = today - timedelta(days=weekday)
                research_text = (
                    "；".join(weekly_research[:8])
                    if weekly_research
                    else "本周暂无已完成的自选研究。"
                )
                body = (
                    "【周总结】"
                    + f"区间 {week_start.isoformat()}～{today.isoformat()}。"
                    + f"最新行情：{'；'.join(market_lines[:3])}。"
                    + f"政策要点：{'；'.join(policy_lines[:3])}。"
                    + f"自选研究：{research_text}"
                )
                if len(body) > 1000:
                    body = f"{body[:999]}…"
                await self._add_notification(
                    session,
                    user_id=user_id,
                    kind="weekly_summary",
                    severity="important",
                    title=f"{week_key} 投研周总结",
                    body=body,
                    target_url="/workspace/market#policy",
                    event_key=f"digest:weekly:{week_key}",
                    now_utc=now_utc,
                )
                settings.last_weekly_period = week_key

            if (
                settings.monthly_summary_enabled
                and month_key is not None
                and settings.last_monthly_period != month_key
            ):
                year, month = map(int, month_key.split("-"))
                start = date(year, month, 1)
                if month == 12:
                    end = date(year + 1, 1, 1) - timedelta(days=1)
                else:
                    end = date(year, month + 1, 1) - timedelta(days=1)
                research_text = (
                    "；".join(monthly_research[:10])
                    if monthly_research
                    else "上月暂无已完成的自选研究。"
                )
                body = (
                    "【月总结】"
                    + f"区间 {start.isoformat()}～{end.isoformat()}。"
                    + f"近期行情参考：{'；'.join(market_lines[:3])}。"
                    + f"政策回顾：{'；'.join(policy_lines[:4])}。"
                    + f"自选研究：{research_text}"
                )
                if len(body) > 1100:
                    body = f"{body[:1099]}…"
                await self._add_notification(
                    session,
                    user_id=user_id,
                    kind="monthly_summary",
                    severity="important",
                    title=f"{month_key} 投研月总结",
                    body=body,
                    target_url="/workspace/market#policy",
                    event_key=f"digest:monthly:{month_key}",
                    now_utc=now_utc,
                )
                settings.last_monthly_period = month_key

            settings.updated_at = now_utc

    @staticmethod
    async def _add_notification(
        session,
        *,
        user_id: str,
        kind: str,
        severity: str,
        title: str,
        body: str,
        target_url: str | None,
        event_key: str,
        now_utc: datetime,
    ) -> None:
        existing = await session.scalar(
            select(ZhihengNotificationRow).where(
                ZhihengNotificationRow.user_id == user_id,
                ZhihengNotificationRow.event_key == event_key,
            )
        )
        if existing is not None:
            if existing.body != body or existing.title != title:
                existing.body = body
                existing.title = title
                existing.target_url = target_url
                existing.created_at = now_utc
            return
        session.add(
            ZhihengNotificationRow(
                id=str(uuid.uuid4()),
                user_id=user_id,
                kind=kind,
                severity=severity,
                symbol=None,
                title=title,
                body=body,
                target_url=target_url,
                event_key=event_key,
                created_at=now_utc,
            )
        )


async def run_digest_push_loop() -> None:
    """Run digest ticks alongside DSA automation until gateway shutdown."""
    service = DigestPushService()
    poll_seconds = max(60, min(int(os.getenv("DIGEST_PUSH_POLL_SECONDS", "120")), 600))
    logger.info(
        "Digest push loop started start=%s poll=%ds",
        digest_start_time().strftime("%H:%M"),
        poll_seconds,
    )
    while True:
        try:
            await service.tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Digest push tick failed")
        await asyncio.sleep(poll_seconds)
