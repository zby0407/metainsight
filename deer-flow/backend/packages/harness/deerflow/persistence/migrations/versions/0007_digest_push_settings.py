"""Add account-scoped digest push settings.

Revision ID: 0007_digest_push_settings
Revises: 0006_news_preferences
Create Date: 2026-08-21
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_digest_push_settings"
down_revision: str | Sequence[str] | None = "0006_news_preferences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "zhiheng_digest_push_settings" in inspector.get_table_names():
        return
    op.create_table(
        "zhiheng_digest_push_settings",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "daily_brief_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "daily_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "weekly_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "monthly_summary_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("last_daily_brief_on", sa.Date(), nullable=True),
        sa.Column("last_daily_summary_on", sa.Date(), nullable=True),
        sa.Column("last_weekly_period", sa.String(length=16), nullable=True),
        sa.Column("last_monthly_period", sa.String(length=7), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    if "zhiheng_digest_push_settings" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("zhiheng_digest_push_settings")
