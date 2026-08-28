"""Add user suspension and persistent authentication policy.

Revision ID: 0003_user_admin_console
Revises: 0002_runs_token_usage
Create Date: 2026-07-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from deerflow.persistence.migrations._helpers import safe_add_column, safe_drop_column

revision: str = "0003_user_admin_console"
down_revision: str | Sequence[str] | None = "0002_runs_token_usage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    safe_add_column(
        "users",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    if "auth_settings" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "auth_settings",
            sa.Column("key", sa.String(length=100), nullable=False),
            sa.Column("value", sa.String(length=2000), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("key"),
        )


def downgrade() -> None:
    if "auth_settings" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("auth_settings")
    safe_drop_column("users", "is_active")
