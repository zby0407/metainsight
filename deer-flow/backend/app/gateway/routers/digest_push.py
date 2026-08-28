"""User-facing API for daily/weekly/monthly digest push subscriptions."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.gateway.deps import get_current_user_from_request
from app.gateway.digest_push import DigestPushService, digest_start_time, weekly_digest_weekday
from deerflow.persistence.dsa.model import DigestPushSettingRow
from deerflow.persistence.engine import get_session_factory

router = APIRouter(prefix="/api/v1/digest-push", tags=["digest-push"])


class DigestPushSettingsResponse(BaseModel):
    dailyBriefEnabled: bool
    dailySummaryEnabled: bool
    weeklySummaryEnabled: bool
    monthlySummaryEnabled: bool
    scheduleTime: str
    timezone: str = "Asia/Shanghai"
    weeklyWeekday: int
    lastDailyBriefOn: str | None = None
    lastDailySummaryOn: str | None = None
    lastWeeklyPeriod: str | None = None
    lastMonthlyPeriod: str | None = None


class UpdateDigestPushSettingsRequest(BaseModel):
    dailyBriefEnabled: bool = True
    dailySummaryEnabled: bool = True
    weeklySummaryEnabled: bool = True
    monthlySummaryEnabled: bool = True


class DigestPushTriggerResponse(BaseModel):
    ok: bool
    message: str


class DigestPolicyHeadlineItem(BaseModel):
    title: str
    summary: str = ""
    source: str = "MetaInsight"
    url: str = "/workspace/news"


class DigestPolicyHeadlinesResponse(BaseModel):
    items: list[DigestPolicyHeadlineItem]


def _session_factory():
    factory = get_session_factory()
    if factory is None:
        raise HTTPException(status_code=503, detail="账户存储尚未就绪")
    return factory


def _serialize(row: DigestPushSettingRow) -> DigestPushSettingsResponse:
    return DigestPushSettingsResponse(
        dailyBriefEnabled=bool(row.daily_brief_enabled),
        dailySummaryEnabled=bool(row.daily_summary_enabled),
        weeklySummaryEnabled=bool(row.weekly_summary_enabled),
        monthlySummaryEnabled=bool(row.monthly_summary_enabled),
        scheduleTime=digest_start_time().strftime("%H:%M"),
        weeklyWeekday=weekly_digest_weekday(),
        lastDailyBriefOn=row.last_daily_brief_on.isoformat() if row.last_daily_brief_on else None,
        lastDailySummaryOn=(
            row.last_daily_summary_on.isoformat() if row.last_daily_summary_on else None
        ),
        lastWeeklyPeriod=row.last_weekly_period,
        lastMonthlyPeriod=row.last_monthly_period,
    )


async def _get_or_create(user_id: str) -> DigestPushSettingRow:
    factory = _session_factory()
    now = datetime.now(UTC)
    async with factory() as session, session.begin():
        row = await session.get(DigestPushSettingRow, user_id)
        if row is None:
            row = DigestPushSettingRow(user_id=user_id, updated_at=now)
            session.add(row)
            await session.flush()
        session.expunge(row)
        return row


@router.get("/settings", response_model=DigestPushSettingsResponse)
async def get_digest_push_settings(request: Request) -> DigestPushSettingsResponse:
    user = await get_current_user_from_request(request)
    row = await _get_or_create(str(user.id))
    return _serialize(row)


@router.get("/headlines", response_model=DigestPolicyHeadlinesResponse)
async def get_digest_policy_headlines(request: Request) -> DigestPolicyHeadlinesResponse:
    """Live policy/macro headlines for the market overview page."""
    await get_current_user_from_request(request)
    service = DigestPushService()
    rows = await service.fetch_policy_headline_items()
    return DigestPolicyHeadlinesResponse(
        items=[DigestPolicyHeadlineItem(**row) for row in rows]
    )


@router.put("/settings", response_model=DigestPushSettingsResponse)
async def update_digest_push_settings(
    request: Request,
    body: UpdateDigestPushSettingsRequest,
) -> DigestPushSettingsResponse:
    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    now = datetime.now(UTC)
    factory = _session_factory()
    async with factory() as session, session.begin():
        row = await session.get(DigestPushSettingRow, user_id)
        if row is None:
            row = DigestPushSettingRow(user_id=user_id, updated_at=now)
            session.add(row)
        row.daily_brief_enabled = body.dailyBriefEnabled
        row.daily_summary_enabled = body.dailySummaryEnabled
        row.weekly_summary_enabled = body.weeklySummaryEnabled
        row.monthly_summary_enabled = body.monthlySummaryEnabled
        row.updated_at = now
        await session.flush()
        session.expunge(row)
    return _serialize(row)


@router.post("/trigger", response_model=DigestPushTriggerResponse)
async def trigger_digest_push_now(request: Request) -> DigestPushTriggerResponse:
    """Force a digest tick (ignores schedule clock; refreshes today's digest rows)."""
    from zoneinfo import ZoneInfo

    from sqlalchemy import delete

    from app.gateway.digest_push import iso_week_period
    from deerflow.persistence.dsa.model import ZhihengNotificationRow

    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    await _get_or_create(user_id)

    shanghai = ZoneInfo("Asia/Shanghai")
    today = datetime.now(shanghai).date()
    week_key = iso_week_period(today)
    event_keys = [
        f"digest:daily-brief:{today.isoformat()}",
        f"digest:daily-summary:{today.isoformat()}",
        f"digest:weekly:{week_key}",
    ]

    factory = _session_factory()
    async with factory() as session, session.begin():
        row = await session.get(DigestPushSettingRow, user_id)
        if row is not None:
            row.last_daily_brief_on = None
            row.last_daily_summary_on = None
            row.last_weekly_period = None
        await session.execute(
            delete(ZhihengNotificationRow).where(
                ZhihengNotificationRow.user_id == user_id,
                ZhihengNotificationRow.event_key.in_(event_keys),
            )
        )

    service = DigestPushService()
    from datetime import time as time_cls

    now_local = datetime.now(shanghai).replace(hour=16, minute=30, second=0, microsecond=0)
    if now_local.time() < time_cls(16, 0):
        now_local = now_local.replace(hour=16, minute=30)
    await service.tick(now=now_local.astimezone(UTC))
    return DigestPushTriggerResponse(ok=True, message="已触发推送检查，请打开通知中心查看")
