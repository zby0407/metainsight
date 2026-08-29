# -*- coding: utf-8 -*-
"""Evidence pack builder: the shared contract for explainable insight pipelines.

Every insight endpoint (review / risk / strategy / sandbox) assembles one
EvidencePack. The pack is simultaneously:
  1. the deterministic computation output (facts/rules),
  2. the grounding input for the AI interpretation layer,
  3. the citation target rendered by the frontend.

Ids are stable per pack: facts F-1.., inputs I-1.., methods M-1..,
rules R-1.., gaps G-1...
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Union

FactValue = Union[float, int, str, bool, None]


class EvidencePackBuilder:
    """Accumulates evidence entries and builds the final pack dict."""

    def __init__(
        self,
        *,
        pack_type: str,
        account_id: Optional[int],
        as_of: Union[str, date],
    ):
        if pack_type not in ("review", "risk", "strategy", "sandbox"):
            raise ValueError(f"Unsupported pack_type: {pack_type}")
        self.pack_type = pack_type
        self.account_id = account_id
        self.as_of = as_of.isoformat() if isinstance(as_of, date) else str(as_of)
        self._facts: List[Dict[str, Any]] = []
        self._inputs: List[Dict[str, Any]] = []
        self._methods: List[Dict[str, Any]] = []
        self._rules: List[Dict[str, Any]] = []
        self._gaps: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------
    # Entry builders
    # ------------------------------------------------------------------

    def add_fact(
        self,
        label: str,
        value: FactValue,
        *,
        unit: Optional[str] = None,
        precision: Optional[int] = None,
        source_fact_ids: Optional[Sequence[str]] = None,
    ) -> str:
        fact_id = f"F-{len(self._facts) + 1}"
        entry: Dict[str, Any] = {"id": fact_id, "label": label, "value": value}
        if unit is not None:
            entry["unit"] = unit
        if precision is not None:
            entry["precision"] = precision
        if source_fact_ids:
            entry["source_fact_ids"] = list(source_fact_ids)
        self._facts.append(entry)
        return fact_id

    def add_input(
        self,
        source: str,
        description: str,
        *,
        date_range: Optional[Sequence[str]] = None,
        row_count: Optional[int] = None,
        stale: bool = False,
    ) -> str:
        input_id = f"I-{len(self._inputs) + 1}"
        entry: Dict[str, Any] = {"id": input_id, "source": source, "description": description}
        if date_range is not None and len(date_range) == 2:
            entry["date_range"] = list(date_range)
        if row_count is not None:
            entry["row_count"] = row_count
        if stale:
            entry["stale"] = True
        self._inputs.append(entry)
        return input_id

    def add_method(self, description: str, *, formula: Optional[str] = None) -> str:
        method_id = f"M-{len(self._methods) + 1}"
        entry: Dict[str, Any] = {"id": method_id, "description": description}
        if formula is not None:
            entry["formula"] = formula
        self._methods.append(entry)
        return method_id

    def add_rule(
        self,
        rule_name: str,
        *,
        current_value: float,
        threshold: float,
        operator: str,
        triggered: Optional[bool] = None,
        related_fact_ids: Optional[Sequence[str]] = None,
    ) -> str:
        if operator not in (">", ">=", "<", "<="):
            raise ValueError(f"Unsupported rule operator: {operator}")
        if triggered is None:
            if operator == ">":
                triggered = current_value > threshold
            elif operator == ">=":
                triggered = current_value >= threshold
            elif operator == "<":
                triggered = current_value < threshold
            else:
                triggered = current_value <= threshold
        rule_id = f"R-{len(self._rules) + 1}"
        entry: Dict[str, Any] = {
            "id": rule_id,
            "rule_name": rule_name,
            "current_value": current_value,
            "threshold": threshold,
            "operator": operator,
            "triggered": bool(triggered),
        }
        if related_fact_ids:
            entry["related_fact_ids"] = list(related_fact_ids)
        self._rules.append(entry)
        return rule_id

    def add_gap(
        self,
        severity: str,
        description: str,
        *,
        affected_fact_ids: Optional[Sequence[str]] = None,
    ) -> str:
        if severity not in ("info", "warning", "critical"):
            raise ValueError(f"Unsupported gap severity: {severity}")
        gap_id = f"G-{len(self._gaps) + 1}"
        entry: Dict[str, Any] = {"id": gap_id, "severity": severity, "description": description}
        if affected_fact_ids:
            entry["affected_fact_ids"] = list(affected_fact_ids)
        self._gaps.append(entry)
        return gap_id

    # ------------------------------------------------------------------
    # Reconciliation helper
    # ------------------------------------------------------------------

    def triggered_rules(self) -> List[Dict[str, Any]]:
        return [rule for rule in self._rules if rule["triggered"]]

    def check_reconciliation(
        self,
        *,
        parts_total: float,
        expected_total: float,
        tolerance: float,
        affected_fact_ids: Optional[Sequence[str]] = None,
        label: str = "归因分项之和与净值变动对账",
    ) -> bool:
        """Record a reconciliation gap when |parts - expected| > tolerance.

        Returns True when the numbers reconcile within tolerance.
        """
        diff = parts_total - expected_total
        if abs(diff) <= tolerance:
            return True
        self.add_gap(
            "warning",
            f"{label}存在差额 {diff:.2f}（分项合计 {parts_total:.2f} vs 期望 {expected_total:.2f}，容差 {tolerance:.2f}）",
            affected_fact_ids=affected_fact_ids,
        )
        return False

    # ------------------------------------------------------------------
    # Final assembly
    # ------------------------------------------------------------------

    def build(self, *, pack_id: Optional[str] = None) -> Dict[str, Any]:
        return {
            "pack_id": pack_id or str(uuid.uuid4()),
            "pack_type": self.pack_type,
            "account_id": self.account_id,
            "as_of": self.as_of,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "facts": list(self._facts),
            "inputs": list(self._inputs),
            "method": list(self._methods),
            "rules": list(self._rules),
            "gaps": list(self._gaps),
        }
