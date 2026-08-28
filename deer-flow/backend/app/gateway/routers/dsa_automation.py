"""User settings, run history, and notifications for automatic DSA research."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select, update

from app.gateway.deps import get_current_user_from_request
from app.gateway.dsa_automation import MAX_SYMBOLS_PER_USER, normalize_a_share_symbol
from deerflow.persistence.dsa.model import (
    DsaAutoResearchRunRow,
    DsaAutoResearchSettingRow,
    DsaAutoResearchSymbolRow,
    ZhihengNotificationRow,
)
from deerflow.persistence.engine import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dsa-automation", tags=["dsa-automation"])
notification_router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class AutoResearchRunResponse(BaseModel):
    id: str
    symbol: str
    sessionDate: str
    status: Literal["pending", "submitted", "completed", "failed"]
    stockName: str | None = None
    summary: str | None = None
    queryId: str | None = None
    error: str | None = None
    createdAt: str
    completedAt: str | None = None


class AutoResearchSettingsResponse(BaseModel):
    enabled: bool
    symbols: list[str]
    maxSymbols: int = MAX_SYMBOLS_PER_USER
    scheduleTime: str = "15:10"
    timezone: str = "Asia/Shanghai"
    maxConcurrentRuns: int = 2
    recentRuns: list[AutoResearchRunResponse] = Field(default_factory=list)


class UpdateAutoResearchSettingsRequest(BaseModel):
    enabled: bool = False
    symbols: list[str] = Field(default_factory=list, max_length=MAX_SYMBOLS_PER_USER)

    @field_validator("symbols")
    @classmethod
    def validate_symbols(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values:
            symbol = normalize_a_share_symbol(value)
            if symbol not in seen:
                seen.add(symbol)
                normalized.append(symbol)
        if len(normalized) > MAX_SYMBOLS_PER_USER:
            raise ValueError(f"最多选择 {MAX_SYMBOLS_PER_USER} 只股票")
        return normalized


class NotificationResponse(BaseModel):
    id: str
    kind: str
    severity: Literal["normal", "important", "critical"]
    symbol: str | None = None
    title: str
    body: str
    targetUrl: str | None = None
    readAt: str | None = None
    createdAt: str


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unreadCount: int


class MarkAllReadResponse(BaseModel):
    updatedCount: int
    unreadCount: int = 0


def _session_factory():
    factory = get_session_factory()
    if factory is None:
        raise HTTPException(status_code=503, detail="账户存储尚未就绪")
    return factory


def _serialize_run(run: DsaAutoResearchRunRow) -> AutoResearchRunResponse:
    return AutoResearchRunResponse(
        id=run.id,
        symbol=run.symbol,
        sessionDate=run.session_date.isoformat(),
        status=run.status,
        stockName=run.stock_name,
        summary=run.summary,
        queryId=run.query_id,
        error=run.last_error,
        createdAt=run.created_at.isoformat(),
        completedAt=run.completed_at.isoformat() if run.completed_at else None,
    )


def _serialize_notification(row: ZhihengNotificationRow) -> NotificationResponse:
    return NotificationResponse(
        id=row.id,
        kind=row.kind,
        severity=row.severity,
        symbol=row.symbol,
        title=row.title,
        body=row.body,
        targetUrl=row.target_url,
        readAt=row.read_at.isoformat() if row.read_at else None,
        createdAt=row.created_at.isoformat(),
    )


async def _settings_response(user_id: str) -> AutoResearchSettingsResponse:
    factory = _session_factory()
    async with factory() as session:
        setting = await session.get(DsaAutoResearchSettingRow, user_id)
        symbols = list(
            await session.scalars(
                select(DsaAutoResearchSymbolRow.symbol)
                .where(DsaAutoResearchSymbolRow.user_id == user_id)
                .order_by(DsaAutoResearchSymbolRow.position, DsaAutoResearchSymbolRow.created_at)
            )
        )
        runs = list(
            await session.scalars(
                select(DsaAutoResearchRunRow)
                .where(DsaAutoResearchRunRow.user_id == user_id)
                .order_by(DsaAutoResearchRunRow.created_at.desc())
                .limit(8)
            )
        )
    return AutoResearchSettingsResponse(
        enabled=bool(setting and setting.enabled),
        symbols=symbols,
        recentRuns=[_serialize_run(run) for run in runs],
    )


@router.get("/settings", response_model=AutoResearchSettingsResponse)
async def get_auto_research_settings(request: Request) -> AutoResearchSettingsResponse:
    user = await get_current_user_from_request(request)
    return await _settings_response(str(user.id))


@router.put("/settings", response_model=AutoResearchSettingsResponse)
async def update_auto_research_settings(
    request: Request,
    body: UpdateAutoResearchSettingsRequest,
) -> AutoResearchSettingsResponse:
    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    if body.enabled and not body.symbols:
        raise HTTPException(status_code=400, detail="请至少选择一只关注股票后再开启")

    factory = _session_factory()
    now = datetime.now(UTC)
    async with factory() as session, session.begin():
        setting = await session.get(DsaAutoResearchSettingRow, user_id)
        if setting is None:
            setting = DsaAutoResearchSettingRow(
                user_id=user_id,
                enabled=body.enabled,
                updated_at=now,
            )
            session.add(setting)
        else:
            setting.enabled = body.enabled
            setting.updated_at = now

        await session.execute(
            delete(DsaAutoResearchSymbolRow).where(DsaAutoResearchSymbolRow.user_id == user_id)
        )
        session.add_all(
            [
                DsaAutoResearchSymbolRow(
                    user_id=user_id,
                    symbol=symbol,
                    position=position,
                    created_at=now,
                )
                for position, symbol in enumerate(body.symbols)
            ]
        )
    return await _settings_response(user_id)


@router.get("/runs", response_model=list[AutoResearchRunResponse])
async def list_auto_research_runs(
    request: Request,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[AutoResearchRunResponse]:
    user = await get_current_user_from_request(request)
    factory = _session_factory()
    async with factory() as session:
        runs = list(
            await session.scalars(
                select(DsaAutoResearchRunRow)
                .where(DsaAutoResearchRunRow.user_id == str(user.id))
                .order_by(DsaAutoResearchRunRow.created_at.desc())
                .limit(limit)
            )
        )
    return [_serialize_run(run) for run in runs]


@notification_router.get("", response_model=NotificationListResponse)
async def list_notifications(
    request: Request,
    limit: int = Query(default=20, ge=1, le=50),
) -> NotificationListResponse:
    user = await get_current_user_from_request(request)
    user_id = str(user.id)
    from app.gateway.routers.news_preferences import sync_news_notifications_for_user

    await sync_news_notifications_for_user(user_id)
    try:
        from app.gateway.digest_push import DigestPushService

        await DigestPushService().refresh_live_inbox(user_id)
    except Exception:
        logger.exception("Live digest refresh failed user=%s", user_id)
    factory = _session_factory()
    async with factory() as session:
        rows = list(
            await session.scalars(
                select(ZhihengNotificationRow)
                .where(ZhihengNotificationRow.user_id == user_id)
                .order_by(ZhihengNotificationRow.created_at.desc())
                .limit(limit)
            )
        )
        unread = int(
            await session.scalar(
                select(func.count(ZhihengNotificationRow.id)).where(
                    ZhihengNotificationRow.user_id == user_id,
                    ZhihengNotificationRow.read_at.is_(None),
                )
            )
            or 0
        )
    return NotificationListResponse(
        items=[_serialize_notification(row) for row in rows],
        unreadCount=unread,
    )


@notification_router.post("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(request: Request) -> MarkAllReadResponse:
    user = await get_current_user_from_request(request)
    factory = _session_factory()
    async with factory() as session, session.begin():
        result = await session.execute(
            update(ZhihengNotificationRow)
            .where(
                ZhihengNotificationRow.user_id == str(user.id),
                ZhihengNotificationRow.read_at.is_(None),
            )
            .values(read_at=datetime.now(UTC))
        )
    return MarkAllReadResponse(updatedCount=int(result.rowcount or 0))


@notification_router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    request: Request,
) -> NotificationResponse:
    user = await get_current_user_from_request(request)
    factory = _session_factory()
    async with factory() as session, session.begin():
        row = await session.scalar(
            select(ZhihengNotificationRow).where(
                ZhihengNotificationRow.id == notification_id,
                ZhihengNotificationRow.user_id == str(user.id),
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="通知不存在")
        if row.read_at is None:
            row.read_at = datetime.now(UTC)
        await session.flush()
        response = _serialize_notification(row)
    return response
