"""Add tenant ownership for DSA watchlists and analysis tasks.

Revision ID: 0005_dsa_tenant_isolation
Revises: 0004_dsa_auto_research
Create Date: 2026-07-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_dsa_tenant_isolation"
down_revision: str | Sequence[str] | None = "0004_dsa_auto_research"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "zhiheng_dsa_tenant_watchlist" not in tables:
        op.create_table(
            "zhiheng_dsa_tenant_watchlist",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("symbol", sa.String(length=32), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "symbol"),
        )
        op.create_index(
            "idx_zhiheng_dsa_tenant_watchlist_user_position",
            "zhiheng_dsa_tenant_watchlist",
            ["user_id", "position"],
        )

    if "zhiheng_dsa_tenant_tasks" not in tables:
        op.create_table(
            "zhiheng_dsa_tenant_tasks",
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("task_id", sa.String(length=128), nullable=False),
            sa.Column("query_id", sa.String(length=128), nullable=True),
            sa.Column("stock_code", sa.String(length=32), nullable=False),
            sa.Column("stock_name", sa.String(length=200), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("user_id", "task_id"),
        )
        op.create_index(
            "idx_zhiheng_dsa_tenant_tasks_user_created",
            "zhiheng_dsa_tenant_tasks",
            ["user_id", "created_at"],
        )
        op.create_index(
            "idx_zhiheng_dsa_tenant_tasks_task",
            "zhiheng_dsa_tenant_tasks",
            ["task_id"],
        )
        op.create_index(
            "idx_zhiheng_dsa_tenant_tasks_query",
            "zhiheng_dsa_tenant_tasks",
            ["query_id"],
        )

        # Preserve ownership already recorded by the account-scoped scheduler.
        op.execute(
            sa.text(
                """
                INSERT INTO zhiheng_dsa_tenant_tasks
                    (user_id, task_id, query_id, stock_code, stock_name, created_at, updated_at)
                SELECT user_id, task_id, MAX(query_id), MAX(symbol), MAX(stock_name),
                       MIN(created_at), MAX(updated_at)
                FROM zhiheng_dsa_auto_runs
                WHERE task_id IS NOT NULL AND task_id != ''
                GROUP BY user_id, task_id
                """
            )
        )

    if "zhiheng_dsa_legacy_imports" not in tables:
        op.create_table(
            "zhiheng_dsa_legacy_imports",
            sa.Column("source", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("source"),
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    for table in (
        "zhiheng_dsa_legacy_imports",
        "zhiheng_dsa_tenant_tasks",
        "zhiheng_dsa_tenant_watchlist",
    ):
        if table in tables:
            op.drop_table(table)

