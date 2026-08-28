"""Persistent models for account-scoped automatic DSA research."""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class DsaAutoResearchSettingRow(Base):
    __tablename__ = "zhiheng_dsa_auto_settings"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )


class DsaAutoResearchSymbolRow(Base):
    __tablename__ = "zhiheng_dsa_auto_symbols"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    __table_args__ = (Index("idx_zhiheng_dsa_auto_symbols_user_position", "user_id", "position"),)


class DsaAutoResearchRunRow(Base):
    __tablename__ = "zhiheng_dsa_auto_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    query_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stock_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "symbol",
            "session_date",
            name="uq_zhiheng_dsa_auto_run_user_symbol_session",
        ),
        Index("idx_zhiheng_dsa_auto_runs_status_retry", "status", "next_attempt_at"),
        Index("idx_zhiheng_dsa_auto_runs_user_created", "user_id", "created_at"),
    )


class DsaTenantWatchlistRow(Base):
    """A user's private watchlist projection over the shared market service."""

    __tablename__ = "zhiheng_dsa_tenant_watchlist"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    __table_args__ = (Index("idx_zhiheng_dsa_tenant_watchlist_user_position", "user_id", "position"),)


class DsaTenantTaskRow(Base):
    """Many-to-many ownership edge from a MetaInsight user to an upstream DSA task."""

    __tablename__ = "zhiheng_dsa_tenant_tasks"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    task_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    query_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stock_code: Mapped[str] = mapped_column(String(32), nullable=False)
    stock_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )

    __table_args__ = (
        Index("idx_zhiheng_dsa_tenant_tasks_user_created", "user_id", "created_at"),
        Index("idx_zhiheng_dsa_tenant_tasks_task", "task_id"),
        Index("idx_zhiheng_dsa_tenant_tasks_query", "query_id"),
    )


class DsaLegacyImportRow(Base):
    """One-time assignment of pre-isolation DSA state to an administrator."""

    __tablename__ = "zhiheng_dsa_legacy_imports"

    source: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )


class ZhihengNotificationRow(Base):
    __tablename__ = "zhiheng_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="normal",
        server_default="normal",
    )
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    target_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    event_key: Mapped[str] = mapped_column(String(240), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "event_key", name="uq_zhiheng_notification_user_event"),
        Index("idx_zhiheng_notifications_user_created", "user_id", "created_at"),
        Index("idx_zhiheng_notifications_user_unread", "user_id", "read_at"),
    )


class DigestPushSettingRow(Base):
    """Account-scoped daily/weekly/monthly market + policy digest subscriptions."""

    __tablename__ = "zhiheng_digest_push_settings"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    daily_brief_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    daily_summary_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    weekly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    monthly_summary_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    last_daily_brief_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_daily_summary_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_weekly_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_monthly_period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )


class NewsPreferenceRow(Base):
    """Account-scoped news topics and durable notification cursor."""

    __tablename__ = "zhiheng_news_preferences"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    followed_topics: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    saved_event_ids: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    notifications_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
    )
