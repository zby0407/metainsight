/** Client for the gateway insight orchestration endpoints.
 *
 * The gateway streams SSE: `computed` carries the deterministic EvidencePack,
 * `ai_delta` streams the grounded interpretation, `done`/`error` terminate.
 */

import { fetch } from "@/core/api/fetcher";

import type { EvidencePack, InsightPackType } from "./evidence-pack";

export interface InsightGenerateBody {
  account_id?: number | null;
  start_date?: string;
  end_date?: string;
  days?: number;
  sandbox?: {
    mode: "what_if" | "scenario";
    adjustments?: { symbol: string; delta_weight_pct: number }[];
    start_date?: string;
    end_date?: string;
    proposed_weights?: Record<string, number>;
  };
}

export interface AttributionRow {
  symbol: string;
  name: string;
  market: string;
  quantity_start: number;
  quantity_end: number;
  weight_start_pct: number | null;
  weight_end_pct: number | null;
  holding_contribution: number;
  trade_contribution: number;
  contribution: number;
  contribution_pct: number | null;
  fact_id?: string | null;
}

export interface ReviewDataRow {
  trade_date: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  note?: string | null;
}

export interface ReviewCashFlowRow {
  event_date: string;
  direction: string;
  amount: number;
}

export interface ReviewData {
  period_return_pct: number | null;
  equity_start: number | null;
  equity_end: number | null;
  net_cash_flow: number;
  cash_flows: ReviewCashFlowRow[];
  attribution: AttributionRow[];
  cash_drag: number;
  trades: ReviewDataRow[];
  reconciliation: {
    parts_total: number;
    expected_total: number;
    difference: number;
    tolerance: number;
    reconciled: boolean;
  } | null;
}

export interface PerformanceMetrics {
  period_return_pct: number | null;
  annualized_return_pct: number | null;
  annualized_volatility_pct: number | null;
  sharpe_ratio: number | null;
  max_drawdown_pct: number | null;
  trading_days: number;
  risk_free_rate_pct: number;
}

export interface PerformanceData {
  series: { date: string; equity: number; cash?: number; market_value?: number }[];
  metrics: PerformanceMetrics;
}

export interface StrategyCandidate {
  candidate_id: string;
  rule_name: string;
  rule_id?: string | null;
  action: "reduce" | "add" | "rebalance" | "hold" | "review";
  target_symbol?: string | null;
  target_name: string;
  trigger_rule: string;
  current_value?: number | null;
  threshold?: number | null;
  rationale: string;
  expected_effect?: {
    post_metric_label: string;
    post_metric_value?: number | null;
    estimated_turnover?: number | null;
    estimated_fee?: number | null;
  } | null;
  related_fact_ids: string[];
}

export interface StrategyData {
  candidates: StrategyCandidate[];
  profile_source: "investor_profile" | "global_config";
}

export interface WhatIfData {
  total_equity: number | null;
  positions: {
    symbol: string;
    name: string;
    weight_before_pct: number;
    weight_after_pct: number;
  }[];
  max_position_weight_before_pct: number | null;
  max_position_weight_after_pct: number | null;
  cash_weight_before_pct: number | null;
  cash_weight_after_pct: number | null;
  positions_after: { symbol: string; market_value: number; weight_pct: number }[];
}

export interface ScenarioData {
  start_date: string;
  end_date: string;
  baseline_return_pct: number | null;
  proposed_return_pct: number | null;
  baseline_max_drawdown_pct: number | null;
  proposed_max_drawdown_pct: number | null;
  series: { date: string; baseline_equity: number; proposed_equity?: number | null }[];
  weights_used: Record<string, number>;
}

export interface InsightComputedPayload {
  pack: EvidencePack;
  data: ReviewData &
    PerformanceData &
    StrategyData &
    WhatIfData &
    ScenarioData & Record<string, unknown>;
}

export interface InsightStreamCallbacks {
  onComputed?: (payload: InsightComputedPayload) => void;
  onAiDelta?: (text: string) => void;
  onDone?: (info: { pack_id?: string | null; report_saved?: boolean }) => void;
  onError?: (message: string) => void;
}

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const rawEvent = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (dataLines.length > 0) onEvent(eventName, dataLines.join("\n"));
    }
  }
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") return payload.detail;
  } catch {
    // fall through to generic message
  }
  return `请求失败（HTTP ${response.status}）`;
}

export async function streamInsightGenerate(
  packType: InsightPackType,
  body: InsightGenerateBody,
  callbacks: InsightStreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/portfolio-insights/${packType}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : "网络错误");
    return;
  }
  if (!response.ok || !response.body) {
    callbacks.onError?.(await extractErrorDetail(response));
    return;
  }
  await consumeSse(response.body, (event, data) => {
    try {
      if (event === "computed") {
        callbacks.onComputed?.(JSON.parse(data) as InsightComputedPayload);
      } else if (event === "ai_delta") {
        const chunk = JSON.parse(data) as { text?: string };
        if (chunk.text) callbacks.onAiDelta?.(chunk.text);
      } else if (event === "done") {
        callbacks.onDone?.(
          JSON.parse(data) as { pack_id?: string | null; report_saved?: boolean },
        );
      } else if (event === "error") {
        const failure = JSON.parse(data) as { message?: string };
        callbacks.onError?.(failure.message ?? "AI 解读失败");
      }
    } catch {
      // Ignore malformed SSE payloads rather than aborting the stream.
    }
  });
}

export interface FollowUpHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export async function streamInsightFollowUp(
  body: { pack_id: string; question: string; history: FollowUpHistoryItem[] },
  callbacks: InsightStreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/v1/portfolio-insights/follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : "网络错误");
    return;
  }
  if (!response.ok || !response.body) {
    callbacks.onError?.(await extractErrorDetail(response));
    return;
  }
  await consumeSse(response.body, (event, data) => {
    try {
      if (event === "ai_delta") {
        const chunk = JSON.parse(data) as { text?: string };
        if (chunk.text) callbacks.onAiDelta?.(chunk.text);
      } else if (event === "done") {
        callbacks.onDone?.(JSON.parse(data) as { pack_id?: string | null });
      } else if (event === "error") {
        const failure = JSON.parse(data) as { message?: string };
        callbacks.onError?.(failure.message ?? "追问回答失败");
      }
    } catch {
      // ignore malformed payloads
    }
  });
}

export interface InsightReportSummary {
  pack_id: string;
  account_id?: number | null;
  pack_type: InsightPackType;
  as_of: string;
  created_at: string;
  ai_interpretation?: string | null;
}

export async function fetchInsightReports(
  packType?: InsightPackType,
): Promise<InsightReportSummary[]> {
  const params = new URLSearchParams();
  if (packType) params.set("pack_type", packType);
  params.set("limit", "20");
  const response = await fetch(
    `/api/v1/portfolio-insights/reports?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { items?: InsightReportSummary[] };
  return payload.items ?? [];
}
