"""Add account-scoped automatic DSA research and in-app notifications.

Revision ID: 0004_dsa_auto_research
Revises: 0003_user_admin_console
Create Date: 2026-07-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_dsa_auto_research"
down_revision: str | Sequence[str] | None = "0003_user_admin_console"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "zhiheng_dsa_auto_settings" not in tables:
        op.create_table(
            "zhiheng_dsa_auto_settings",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id"),
        )

    if "zhiheng_dsa_auto_symbols" not in tables:
        op.create_table(
            "zhiheng_dsa_auto_symbols",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("symbol", sa.String(length=32), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "symbol"),
        )
        op.create_index(
            "idx_zhiheng_dsa_auto_symbols_user_position",
            "zhiheng_dsa_auto_symbols",
            ["user_id", "position"],
        )

    if "zhiheng_dsa_auto_runs" not in tables:
        op.create_table(
            "zhiheng_dsa_auto_runs",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("symbol", sa.String(length=32), nullable=False),
            sa.Column("session_date", sa.Date(), nullable=False),
            sa.Column("status", sa.String(length=24), server_default="pending", nullable=False),
            sa.Column("task_id", sa.String(length=128), nullable=True),
            sa.Column("query_id", sa.String(length=128), nullable=True),
            sa.Column("stock_name", sa.String(length=200), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "symbol",
                "session_date",
                name="uq_zhiheng_dsa_auto_run_user_symbol_session",
            ),
        )
        op.create_index(
            "idx_zhiheng_dsa_auto_runs_status_retry",
            "zhiheng_dsa_auto_runs",
            ["status", "next_attempt_at"],
        )
        op.create_index(
            "idx_zhiheng_dsa_auto_runs_user_created",
            "zhiheng_dsa_auto_runs",
            ["user_id", "created_at"],
        )

    if "zhiheng_notifications" not in tables:
        op.create_table(
            "zhiheng_notifications",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("severity", sa.String(length=16), server_default="normal", nullable=False),
            sa.Column("symbol", sa.String(length=32), nullable=True),
            sa.Column("title", sa.String(length=240), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("target_url", sa.String(length=1000), nullable=True),
            sa.Column("event_key", sa.String(length=240), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "event_key", name="uq_zhiheng_notification_user_event"),
        )
        op.create_index(
            "idx_zhiheng_notifications_user_created",
            "zhiheng_notifications",
            ["user_id", "created_at"],
        )
        op.create_index(
            "idx_zhiheng_notifications_user_unread",
            "zhiheng_notifications",
            ["user_id", "read_at"],
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    for table in (
        "zhiheng_notifications",
        "zhiheng_dsa_auto_runs",
        "zhiheng_dsa_auto_symbols",
        "zhiheng_dsa_auto_settings",
    ):
        if table in tables:
            op.drop_table(table)

