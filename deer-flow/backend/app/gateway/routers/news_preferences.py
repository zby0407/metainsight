"""Account-scoped news preferences and durable topic notifications."""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.gateway.deps import get_current_user_from_request
from deerflow.persistence.dsa.model import NewsPreferenceRow, ZhihengNotificationRow
from deerflow.persistence.engine import get_session_factory

router = APIRouter(prefix="/api/v1/news-preferences", tags=["news-preferences"])

ALLOWED_TOPICS = frozenset({"人工智能", "芯片", "机器人", "经济", "足球", "篮球"})


class NewsPreferencesResponse(BaseModel):
    configured: bool
    followedTopics: list[str]
    savedEventIds: list[str]
    notificationsEnabled: bool
    lastNotifiedAt: str | None = None


class UpdateNewsPreferencesRequest(BaseModel):
    followedTopics: list[str] = Field(default_factory=list, max_length=12)
    savedEventIds: list[str] = Field(default_factory=list, max_length=50)
    notificationsEnabled: bool = False

    @field_validator("followedTopics")
    @classmethod
    def validate_topics(cls, values: list[str]) -> list[str]:
        unique = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if any(value not in ALLOWED_TOPICS for value in unique):
            raise ValueError("包含不支持的新闻话题")
        return unique

    @field_validator("savedEventIds")
    @classmethod
    def validate_saved_event_ids(cls, values: list[str]) -> list[str]:
        try:
            return list(dict.fromkeys(str(UUID(value)) for value in values))
        except ValueError as exc:
            raise ValueError("包含无效的新闻事件 ID") from exc


def _session_factory():
    factory = get_session_factory()
    if factory is None:
        raise HTTPException(status_code=503, detail="账户存储尚未就绪")
    return factory


def _serialize(row: NewsPreferenceRow | None) -> NewsPreferencesResponse:
    return NewsPreferencesResponse(
        configured=row is not None,
        followedTopics=list(row.followed_topics or []) if row else [],
        savedEventIds=list(row.saved_event_ids or []) if row else [],
        notificationsEnabled=bool(row and row.notifications_enabled),
        lastNotifiedAt=(row.last_notified_at.isoformat() if row and row.last_notified_at else None),
    )


@router.get("", response_model=NewsPreferencesResponse)
async def get_news_preferences(request: Request) -> NewsPreferencesResponse:
    user = await get_current_user_from_request(request)
    factory = _session_factory()
    async with factory() as session:
        row = await session.get(NewsPreferenceRow, str(user.id))
    return _serialize(row)


@router.put("", response_model=NewsPreferencesResponse)
async def update_news_preferences(
    request: Request,
    body: UpdateNewsPreferencesRequest,
) -> NewsPreferencesResponse:
    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    now = datetime.now(UTC)
    factory = _session_factory()
    async with factory() as session, session.begin():
        row = await session.get(NewsPreferenceRow, user_id)
        if row is None:
            row = NewsPreferenceRow(
                user_id=user_id,
                followed_topics=body.followedTopics,
                saved_event_ids=body.savedEventIds,
                notifications_enabled=body.notificationsEnabled,
                last_notified_at=now if body.notificationsEnabled else None,
                updated_at=now,
            )
            session.add(row)
        else:
            enabling = body.notificationsEnabled and not row.notifications_enabled
            row.followed_topics = body.followedTopics
            row.saved_event_ids = body.savedEventIds
            row.notifications_enabled = body.notificationsEnabled
            if enabling:
                row.last_notified_at = now
            row.updated_at = now
        await session.flush()
        response = _serialize(row)
    return response


def _matches_topics(event: dict, topics: list[str]) -> str | None:
    text = f"{event.get('title', '')} {event.get('summary', '')}".lower()
    return next((topic for topic in topics if topic.lower() in text), None)


def _parse_time(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


async def sync_news_notifications_for_user(user_id: str) -> None:
    """Materialize topic updates into the existing account notification inbox."""
    factory = get_session_factory()
    if factory is None:
        return
    now = datetime.now(UTC)
    async with factory() as session, session.begin():
        preference = await session.get(NewsPreferenceRow, user_id)
        if preference is None or not preference.notifications_enabled or not preference.followed_topics:
            return
        last_checked_at = preference.last_checked_at
        if last_checked_at is not None:
            checked_at_utc = last_checked_at.replace(tzinfo=UTC) if last_checked_at.tzinfo is None else last_checked_at.astimezone(UTC)
            if now - checked_at_utc < timedelta(minutes=2):
                return
        # Claim a short polling window before making upstream requests. This
        # prevents every browser notification poll from fanning out to all
        # three news channels, while keeping the durable per-user cursor.
        preference.last_checked_at = now
        cursor = preference.last_notified_at
        topics = list(preference.followed_topics)

    base_url = os.getenv(
        "FINANCE_NEWS_INTERNAL_API_URL",
        "http://finance-api:8000/api/news",
    ).rstrip("/")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=4.0),
            trust_env=False,
        ) as client:
            responses = await asyncio.gather(
                *(
                    client.get(
                        f"{base_url}/feed",
                        params={"channel": channel, "sort": "latest", "limit": 20},
                    )
                    for channel in ("general", "technology", "sports")
                )
            )
        for response in responses:
            response.raise_for_status()
        events = {str(item.get("id")): item for response in responses for item in response.json().get("items", []) if isinstance(item, dict) and item.get("id")}
    except (httpx.HTTPError, ValueError, TypeError):
        return

    dated_events = [(published_at, event) for event in events.values() if (published_at := _parse_time(event.get("lastPublishedAt"))) is not None]
    if not dated_events:
        return
    newest_at = max(published_at for published_at, _event in dated_events)
    if cursor is None:
        async with factory() as session, session.begin():
            row = await session.get(NewsPreferenceRow, user_id)
            if row is not None:
                row.last_notified_at = newest_at
        return

    cursor_utc = cursor.replace(tzinfo=UTC) if cursor.tzinfo is None else cursor.astimezone(UTC)
    matches = [(published_at, event, topic) for published_at, event in dated_events if published_at > cursor_utc and (topic := _matches_topics(event, topics)) is not None]
    matches.sort(key=lambda item: item[0])

    async with factory() as session, session.begin():
        row = await session.get(NewsPreferenceRow, user_id)
        if row is None or not row.notifications_enabled:
            return
        event_keys = [f"news:{event['id']}:{published_at.isoformat()}" for published_at, event, _topic in matches[-5:]]
        existing = (
            set(
                await session.scalars(
                    select(ZhihengNotificationRow.event_key).where(
                        ZhihengNotificationRow.user_id == user_id,
                        ZhihengNotificationRow.event_key.in_(event_keys),
                    )
                )
            )
            if event_keys
            else set()
        )
        for (published_at, event, topic), event_key in zip(matches[-5:], event_keys, strict=True):
            if event_key in existing:
                continue
            summary = " ".join(str(event.get("summary") or "").split())
            session.add(
                ZhihengNotificationRow(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind="news_topic_update",
                    severity="important" if int(event.get("sourceCount") or 0) >= 3 else "normal",
                    title=f"你关注的「{topic}」有新进展",
                    body=(str(event.get("title") or "新闻动态") + (f" · {summary}" if summary else ""))[:500],
                    target_url=f"/workspace/news/{event['id']}",
                    event_key=event_key,
                    created_at=published_at,
                )
            )
        row.last_notified_at = max(newest_at, cursor_utc)
