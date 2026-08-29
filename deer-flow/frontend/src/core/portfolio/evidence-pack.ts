/** EvidencePack contract shared with the daily-stock-analysis insight pipeline.
 *
 * Every insight feature (review / risk / strategy / sandbox) returns one pack:
 * deterministic facts (F-), data inputs (I-), methods (M-), rule evaluations
 * (R-) and data gaps (G-). AI interpretations must cite these ids only.
 * Snake_case as served.
 */

export type InsightPackType = "review" | "risk" | "strategy" | "sandbox";

export interface EvidenceFact {
  id: string;
  label: string;
  value: number | string | boolean | null;
  unit?: string;
  precision?: number;
  source_fact_ids?: string[];
}

export interface EvidenceInput {
  id: string;
  source: string;
  description: string;
  date_range?: [string, string];
  row_count?: number;
  stale?: boolean;
}

export interface EvidenceMethod {
  id: string;
  description: string;
  formula?: string;
}

export interface EvidenceRule {
  id: string;
  rule_name: string;
  current_value: number;
  threshold: number;
  operator: ">" | ">=" | "<" | "<=";
  triggered: boolean;
  related_fact_ids?: string[];
}

export interface EvidenceGap {
  id: string;
  severity: "info" | "warning" | "critical";
  description: string;
  affected_fact_ids?: string[];
}

export interface EvidencePack {
  pack_id: string;
  pack_type: InsightPackType;
  account_id: number | null;
  as_of: string;
  generated_at: string;
  facts: EvidenceFact[];
  inputs: EvidenceInput[];
  method: EvidenceMethod[];
  rules: EvidenceRule[];
  gaps: EvidenceGap[];
}

/** Anything addressable by a citation id ([F-1], [R-2], [I-1], [G-1]). */
export type EvidenceEntry =
  | ({ kind: "fact" } & EvidenceFact)
  | ({ kind: "input" } & EvidenceInput)
  | ({ kind: "method" } & EvidenceMethod)
  | ({ kind: "rule" } & EvidenceRule)
  | ({ kind: "gap" } & EvidenceGap);

export function buildEvidenceIndex(pack: EvidencePack): Map<string, EvidenceEntry> {
  const index = new Map<string, EvidenceEntry>();
  for (const fact of pack.facts) index.set(fact.id, { kind: "fact", ...fact });
  for (const input of pack.inputs) index.set(input.id, { kind: "input", ...input });
  for (const method of pack.method) index.set(method.id, { kind: "method", ...method });
  for (const rule of pack.rules) index.set(rule.id, { kind: "rule", ...rule });
  for (const gap of pack.gaps) index.set(gap.id, { kind: "gap", ...gap });
  return index;
}

export function evidenceEntrySummary(entry: EvidenceEntry): string {
  switch (entry.kind) {
    case "fact": {
      const value = entry.value == null ? "—" : String(entry.value);
      return `${entry.label}：${value}${entry.unit ? ` ${entry.unit}` : ""}`;
    }
    case "input":
      return `数据来源：${entry.description}`;
    case "method":
      return entry.formula ? `${entry.description}（${entry.formula}）` : entry.description;
    case "rule":
      return `规则 ${entry.rule_name}：当前 ${entry.current_value} ${entry.operator} 阈值 ${entry.threshold}${
        entry.triggered ? "（触发）" : "（未触发）"
      }`;
    case "gap":
      return `数据缺口：${entry.description}`;
    default:
      return "";
  }
}
