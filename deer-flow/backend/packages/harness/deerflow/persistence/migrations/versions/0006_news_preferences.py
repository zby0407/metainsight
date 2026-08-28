"""Add account-scoped news preferences.

Revision ID: 0006_news_preferences
Revises: 0005_dsa_tenant_isolation
Create Date: 2026-07-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_news_preferences"
down_revision: str | Sequence[str] | None = "0005_dsa_tenant_isolation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "zhiheng_news_preferences" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("zhiheng_news_preferences")}
        if "last_checked_at" not in columns:
            with op.batch_alter_table("zhiheng_news_preferences") as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "last_checked_at",
                        sa.DateTime(timezone=True),
                        nullable=True,
                    )
                )
        return
    op.create_table(
        "zhiheng_news_preferences",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("followed_topics", sa.JSON(), nullable=False),
        sa.Column("saved_event_ids", sa.JSON(), nullable=False),
        sa.Column(
            "notifications_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    if "zhiheng_news_preferences" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("zhiheng_news_preferences")
