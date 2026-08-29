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

export interface PersistedInsightReport {
  pack_id: string;
  as_of: string;
  created_at: string;
  pack: EvidencePack;
  data: InsightComputedPayload["data"];
  ai_interpretation: string | null;
}

/** Load the latest persisted report of a pack type straight from the stock
 * service so a view can hydrate from an earlier run instead of re-running
 * the pipeline on every open (pipeline runs at most once per day). */
export async function fetchLatestInsightReport(
  packType: InsightPackType,
): Promise<PersistedInsightReport | null> {
  let response: Response;
  try {
    response = await fetch(
      `/stock-api/portfolio/insight-reports?pack_type=${packType}&limit=1`,
      { cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    items?: {
      pack_id?: string;
      as_of?: string;
      created_at?: string;
      evidence_pack?: EvidencePack;
      data?: InsightComputedPayload["data"];
      ai_interpretation?: string | null;
    }[];
  };
  const item = payload.items?.[0];
  if (!item?.evidence_pack) return null;
  return {
    pack_id: item.pack_id ?? item.evidence_pack.pack_id,
    as_of: item.as_of ?? item.evidence_pack.as_of,
    created_at: item.created_at ?? "",
    pack: item.evidence_pack,
    data: (item.data ?? {}) as InsightComputedPayload["data"],
    ai_interpretation: item.ai_interpretation ?? null,
  };
}

/** Deterministic strategy candidates (no AI pass) so the view paints instantly. */
export async function fetchStrategyCandidates(params?: {
  account_id?: number | null;
  owner_id?: string;
  cost_method?: string;
}): Promise<{ pack: EvidencePack; data: StrategyData } | null> {
  const search = new URLSearchParams();
  if (params?.account_id != null) search.set("account_id", String(params.account_id));
  search.set("owner_id", params?.owner_id ?? "default");
  search.set("cost_method", params?.cost_method ?? "fifo");
  let response: Response;
  try {
    response = await fetch(`/stock-api/portfolio/strategy-candidates?${search.toString()}`, {
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as { pack: EvidencePack; data: StrategyData };
}

export interface InvestorProfile {
  owner_id: string;
  cash_floor_pct: number;
  single_position_cap_pct: number;
  sector_cap_pct: number;
  rebalance_threshold_pct: number;
  stop_loss_pct: number;
  source: "stored" | "default";
}

/** Thresholds used by the sandbox for local constraint hints. */
export async function fetchInvestorProfile(
  ownerId = "default",
): Promise<InvestorProfile | null> {
  let response: Response;
  try {
    response = await fetch(
      `/stock-api/portfolio/investor-profile?owner_id=${encodeURIComponent(ownerId)}`,
      { cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as InvestorProfile;
}

export interface SandboxComputedResult {
  pack: EvidencePack;
  data: WhatIfData & ScenarioData & Record<string, unknown>;
}

/** Deterministic sandbox compute (no AI pass). Used for instant previews so
 * dragging a slider never waits on the interpretation stream. */
export async function runSandboxWhatIf(body: {
  account_id?: number | null;
  adjustments?: { symbol: string; delta_weight_pct: number }[];
  cost_method?: string;
}): Promise<SandboxComputedResult | null> {
  let response: Response;
  try {
    response = await fetch("/stock-api/portfolio/sandbox/what-if", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as SandboxComputedResult;
}

export async function runSandboxScenario(body: {
  account_id?: number | null;
  start_date: string;
  end_date: string;
  proposed_weights: Record<string, number>;
  cost_method?: string;
}): Promise<SandboxComputedResult | null> {
  let response: Response;
  try {
    response = await fetch("/stock-api/portfolio/sandbox/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return (await response.json()) as SandboxComputedResult;
}

export interface RebalanceTarget {
  symbol: string;
  market: string;
  current_weight_pct: number;
  target_weight_pct: number;
  unrealized_pnl_pct?: number | null;
  baseline_weight_pct?: number | null;
  reasons: string[];
  signal?: { id?: number | null; action?: string; stock_code?: string } | null;
}

export interface RebalanceTrade {
  symbol: string;
  market: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  estimated_value: number;
  estimated_fee: number;
  estimated_tax?: number | null;
  lot_rounded?: boolean | null;
  post_weight_pct?: number | null;
}

export interface RebalancePlan {
  profile_source: string;
  window_days: number;
  plan: {
    plan_id: string;
    cash_before_pct: number;
    cash_after_pct: number;
    targets: RebalanceTarget[];
    trades: RebalanceTrade[];
  };
  comparison: ScenarioData;
}

export async function fetchRebalancePlan(
  windowDays: number,
): Promise<RebalancePlan | null> {
  let response: Response;
  try {
    response = await fetch(
      `/stock-api/portfolio/rebalance-plan?window_days=${windowDays}`,
      { cache: "no-store" },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: RebalancePlan };
  return payload.data ?? null;
}

export interface RebalanceExecutionResult {
  executed: { symbol: string; side: string }[];
  skipped: { symbol: string; side: string; reason: string }[];
}

export interface RebalanceExecutionOutcome {
  result: RebalanceExecutionResult | null;
  error: string | null;
}

/** Execute the plan the user confirmed. `expectedPlanId` lets the backend
 * reject (409) when the portfolio drifted after the preview was rendered. */
export async function executeRebalancePlan(
  windowDays: number,
  expectedPlanId?: string | null,
): Promise<RebalanceExecutionOutcome> {
  let response: Response;
  try {
    response = await fetch("/stock-api/portfolio/rebalance-plan/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        window_days: windowDays,
        expected_plan_id: expectedPlanId ?? null,
      }),
    });
  } catch {
    return { result: null, error: "网络错误，请稍后重试" };
  }
  if (!response.ok) {
    let detail = `执行失败（HTTP ${response.status}）`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") detail = payload.detail;
    } catch {
      // fall through to the generic message
    }
    return { result: null, error: detail };
  }
  return { result: (await response.json()) as RebalanceExecutionResult, error: null };
}
