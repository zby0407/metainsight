# -*- coding: utf-8 -*-
"""Insights repository: investor profiles and persisted insight reports."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.storage import (
    DatabaseManager,
    PortfolioInsightReport,
    PortfolioInvestorProfile,
)

logger = logging.getLogger(__name__)

PROFILE_FIELDS = (
    "cash_floor_pct",
    "single_position_cap_pct",
    "sector_cap_pct",
    "rebalance_threshold_pct",
    "stop_loss_pct",
)

DEFAULT_PROFILE: Dict[str, float] = {
    "cash_floor_pct": 5.0,
    "single_position_cap_pct": 35.0,
    "sector_cap_pct": 40.0,
    "rebalance_threshold_pct": 10.0,
    "stop_loss_pct": 10.0,
}


class InsightsRepository:
    """DB access layer for insight pipeline persistence."""

    def __init__(self, db_manager: Optional[DatabaseManager] = None):
        self.db = db_manager or DatabaseManager.get_instance()

    # ------------------------------------------------------------------
    # Investor profile
    # ------------------------------------------------------------------

    def get_profile(self, owner_id: str) -> Optional[Dict[str, Any]]:
        with self.db.get_session() as session:
            row = session.execute(
                select(PortfolioInvestorProfile).where(
                    PortfolioInvestorProfile.owner_id == owner_id
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            return {
                "owner_id": row.owner_id,
                **{field: float(getattr(row, field)) for field in PROFILE_FIELDS},
            }

    def upsert_profile(self, owner_id: str, fields: Dict[str, float]) -> Dict[str, Any]:
        existing = self.get_profile(owner_id)
        merged = dict(DEFAULT_PROFILE)
        if existing:
            merged.update({field: existing[field] for field in PROFILE_FIELDS})
        for key, value in fields.items():
            if key in PROFILE_FIELDS and value is not None:
                merged[key] = float(value)

        with self.db.get_session() as session:
            row = session.execute(
                select(PortfolioInvestorProfile).where(
                    PortfolioInvestorProfile.owner_id == owner_id
                )
            ).scalar_one_or_none()
            if row is None:
                row = PortfolioInvestorProfile(owner_id=owner_id)
                session.add(row)
            for key, value in merged.items():
                setattr(row, key, value)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                # Concurrent insert lost the race; re-read the winning row.
                saved = self.get_profile(owner_id)
                if saved is not None:
                    return saved
                raise
            return {
                "owner_id": owner_id,
                **{field: float(getattr(row, field)) for field in PROFILE_FIELDS},
            }

    # ------------------------------------------------------------------
    # Insight reports
    # ------------------------------------------------------------------

    def save_report(
        self,
        *,
        pack_id: str,
        account_id: Optional[int],
        pack_type: str,
        as_of: str,
        evidence_pack: Dict[str, Any],
        data: Optional[Dict[str, Any]] = None,
        ai_interpretation: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self.db.get_session() as session:
            existing = session.execute(
                select(PortfolioInsightReport).where(
                    PortfolioInsightReport.pack_id == pack_id
                )
            ).scalar_one_or_none()
            if existing is not None:
                if ai_interpretation is not None:
                    existing.ai_interpretation = ai_interpretation
                if data is not None:
                    existing.data_json = json.dumps(data, ensure_ascii=False)
                session.commit()
                return self._row_to_dict(existing)
            row = PortfolioInsightReport(
                pack_id=pack_id,
                account_id=account_id,
                pack_type=pack_type,
                evidence_pack_json=json.dumps(evidence_pack, ensure_ascii=False),
                data_json=json.dumps(data, ensure_ascii=False) if data is not None else None,
                ai_interpretation=ai_interpretation,
            )
            session.add(row)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                dup = session.execute(
                    select(PortfolioInsightReport).where(
                        PortfolioInsightReport.pack_id == pack_id
                    )
                ).scalar_one_or_none()
                if dup is not None:
                    return self._row_to_dict(dup)
                raise
            session.refresh(row)
            return self._row_to_dict(row)

    def get_report(self, pack_id: str) -> Optional[Dict[str, Any]]:
        with self.db.get_session() as session:
            row = session.execute(
                select(PortfolioInsightReport).where(
                    PortfolioInsightReport.pack_id == pack_id
                )
            ).scalar_one_or_none()
            return self._row_to_dict(row) if row is not None else None

    def list_reports(
        self,
        *,
        account_id: Optional[int] = None,
        pack_type: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        with self.db.get_session() as session:
            query = select(PortfolioInsightReport)
            if account_id is not None:
                query = query.where(PortfolioInsightReport.account_id == account_id)
            if pack_type:
                query = query.where(PortfolioInsightReport.pack_type == pack_type)
            rows = session.execute(
                query.order_by(PortfolioInsightReport.created_at.desc()).limit(max(1, min(limit, 100)))
            ).scalars().all()
            return [self._row_to_dict(row) for row in rows]

    @staticmethod
    def _row_to_dict(row: PortfolioInsightReport) -> Dict[str, Any]:
        try:
            evidence_pack = json.loads(row.evidence_pack_json) if row.evidence_pack_json else {}
        except (TypeError, ValueError):
            logger.warning("Insight report %s has invalid evidence_pack_json", row.pack_id)
            evidence_pack = {}
        try:
            data = json.loads(row.data_json) if row.data_json else {}
        except (TypeError, ValueError):
            logger.warning("Insight report %s has invalid data_json", row.pack_id)
            data = {}
        return {
            "pack_id": row.pack_id,
            "account_id": row.account_id,
            "pack_type": row.pack_type,
            "as_of": str(evidence_pack.get("as_of") or ""),
            "created_at": row.created_at.isoformat() if row.created_at else "",
            "ai_interpretation": row.ai_interpretation,
            "evidence_pack": evidence_pack,
            "data": data,
        }
