"""Tenant ownership helpers for the shared upstream DSA service."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .model import DsaLegacyImportRow, DsaTenantTaskRow, DsaTenantWatchlistRow

LEGACY_IMPORT_SOURCE = "stock-server-global-v1"


class DsaTenantRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_watchlist(self, user_id: str) -> list[str]:
        async with self._session_factory() as session:
            return list(
                await session.scalars(
                    select(DsaTenantWatchlistRow.symbol)
                    .where(DsaTenantWatchlistRow.user_id == user_id)
                    .order_by(
                        DsaTenantWatchlistRow.position,
                        DsaTenantWatchlistRow.created_at,
                    )
                )
            )

    async def add_watchlist(self, user_id: str, symbol: str) -> list[str]:
        async with self._session_factory() as session, session.begin():
            row = await session.get(DsaTenantWatchlistRow, (user_id, symbol))
            if row is None:
                next_position = int(
                    await session.scalar(
                        select(func.coalesce(func.max(DsaTenantWatchlistRow.position), -1)).where(
                            DsaTenantWatchlistRow.user_id == user_id
                        )
                    )
                    or 0
                ) + 1
                session.add(
                    DsaTenantWatchlistRow(
                        user_id=user_id,
                        symbol=symbol,
                        position=next_position,
                    )
                )
        return await self.list_watchlist(user_id)

    async def remove_watchlist(self, user_id: str, symbol: str) -> list[str]:
        async with self._session_factory() as session, session.begin():
            await session.execute(
                delete(DsaTenantWatchlistRow).where(
                    DsaTenantWatchlistRow.user_id == user_id,
                    DsaTenantWatchlistRow.symbol == symbol,
                )
            )
        return await self.list_watchlist(user_id)

    async def replace_watchlist(self, user_id: str, symbols: list[str]) -> None:
        async with self._session_factory() as session, session.begin():
            await session.execute(
                delete(DsaTenantWatchlistRow).where(
                    DsaTenantWatchlistRow.user_id == user_id
                )
            )
            now = datetime.now(UTC)
            session.add_all(
                [
                    DsaTenantWatchlistRow(
                        user_id=user_id,
                        symbol=symbol,
                        position=position,
                        created_at=now,
                    )
                    for position, symbol in enumerate(dict.fromkeys(symbols))
                ]
            )

    async def claim_task(
        self,
        user_id: str,
        task_id: str,
        stock_code: str,
        *,
        query_id: str | None = None,
        stock_name: str | None = None,
    ) -> None:
        async with self._session_factory() as session, session.begin():
            await claim_task_in_session(
                session,
                user_id=user_id,
                task_id=task_id,
                stock_code=stock_code,
                query_id=query_id,
                stock_name=stock_name,
            )

    async def owned_task_refs(self, user_id: str) -> set[str]:
        async with self._session_factory() as session:
            rows = (
                await session.execute(
                    select(DsaTenantTaskRow.task_id, DsaTenantTaskRow.query_id).where(
                        DsaTenantTaskRow.user_id == user_id
                    )
                )
            ).all()
        return {
            value
            for task_id, query_id in rows
            for value in (task_id, query_id)
            if value
        }

    async def owns_task_ref(self, user_id: str, task_or_query_id: str) -> bool:
        async with self._session_factory() as session:
            count = await session.scalar(
                select(func.count())
                .select_from(DsaTenantTaskRow)
                .where(
                    DsaTenantTaskRow.user_id == user_id,
                    or_(
                        DsaTenantTaskRow.task_id == task_or_query_id,
                        DsaTenantTaskRow.query_id == task_or_query_id,
                    ),
                )
            )
        return bool(count)

    async def legacy_import_owner(self) -> str | None:
        async with self._session_factory() as session:
            row = await session.get(DsaLegacyImportRow, LEGACY_IMPORT_SOURCE)
            return row.user_id if row is not None else None

    async def mark_legacy_imported(self, user_id: str) -> None:
        try:
            async with self._session_factory() as session, session.begin():
                row = await session.get(DsaLegacyImportRow, LEGACY_IMPORT_SOURCE)
                if row is None:
                    session.add(
                        DsaLegacyImportRow(
                            source=LEGACY_IMPORT_SOURCE,
                            user_id=user_id,
                        )
                    )
        except IntegrityError:
            # Two first admin requests can race through the read check. The
            # primary key makes the one-time assignment deterministic; losing
            # the insert race is a successful no-op.
            return


async def claim_task_in_session(
    session: AsyncSession,
    *,
    user_id: str,
    task_id: str,
    stock_code: str,
    query_id: str | None = None,
    stock_name: str | None = None,
) -> None:
    """Create or enrich an ownership edge inside the caller's transaction."""
    normalized_task_id = str(task_id or "").strip()
    if not normalized_task_id:
        return
    now = datetime.now(UTC)
    row = await session.get(DsaTenantTaskRow, (user_id, normalized_task_id))
    if row is None:
        session.add(
            DsaTenantTaskRow(
                user_id=user_id,
                task_id=normalized_task_id,
                query_id=str(query_id).strip() if query_id else None,
                stock_code=str(stock_code or "UNKNOWN").strip().upper()[:32],
                stock_name=str(stock_name).strip()[:200] if stock_name else None,
                created_at=now,
                updated_at=now,
            )
        )
        return
    if query_id:
        row.query_id = str(query_id).strip()
    if stock_name:
        row.stock_name = str(stock_name).strip()[:200]
    row.updated_at = now
