"use client";

import { AlertTriangleIcon, FlaskConicalIcon, LoaderIcon, SlidersHorizontalIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { type EnrichedPosition } from "@/core/portfolio";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import {
  fetchInvestorProfile,
  runSandboxScenario,
  runSandboxWhatIf,

  type InsightGenerateBody,
  type InvestorProfile,
  type SandboxComputedResult,
  type ScenarioData,
  type WhatIfData,
} from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { AiSidePanel, type AiFocus } from "../evidence/ai-side-panel";

/** Kept in sync with the backend: commission 0.05%, A-share sell stamp duty 0.05%. */
const FEE_RATE = 0.0005;
const STAMP_DUTY_RATE = 0.0005;

type SandboxMode = "what_if" | "scenario";

interface PositionSeed {
  symbol: string;
  name: string;
  market: string;
  marketValue: number;
  weightPct: number;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function SandboxView({
  item,
  seedTargets,
}: {
  item: PortfolioDashboardItem;
  seedTargets?: Record<string, number> | null;
}) {
  const [mode, setMode] = useState<SandboxMode>("what_if");
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const accountId = Number(item.portfolio.id);

  useEffect(() => {
    let cancelled = false;
    void fetchInvestorProfile().then((next) => {
      if (!cancelled) setProfile(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const equity = Number(item.latestSnapshot?.totalEquity ?? 0);
  const positions = useMemo<PositionSeed[]>(
    () =>
      ((item.positions ?? []) as EnrichedPosition[])
        .map((position) => {
          const marketValue = Number(position.marketValue ?? 0);
          return {
            symbol: position.symbol,
            name: position.name ?? position.symbol,
            market: String(position.market ?? ""),
            marketValue,
            weightPct: equity > 0 ? (marketValue / equity) * 100 : 0,
          };
        })
        .filter((position) => position.marketValue > 0)
        .sort((a, b) => b.weightPct - a.weightPct),
    [item.positions, equity],
  );

  return (
    <div className="w-full space-y-6">
      <div className="border-border bg-card inline-flex items-center gap-1 rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setMode("what_if")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "what_if"
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground",
          )}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          调仓 what-if
        </button>
        <button
          type="button"
          onClick={() => setMode("scenario")}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === "scenario"
              ? "bg-foreground text-background"
              : "text-foreground/60 hover:text-foreground",
          )}
        >
          <FlaskConicalIcon className="size-3.5" />
          历史情景回放
        </button>
      </div>

      {mode === "what_if" ? (
        <WhatIfSandbox
          accountId={accountId}
          positions={positions}
          equity={equity}
          cap={profile?.single_position_cap_pct ?? null}
          seedTargets={seedTargets}
        />
      ) : (
        <ScenarioSandbox
          accountId={accountId}
          positions={positions}
          equity={equity}
          cap={profile?.single_position_cap_pct ?? null}
          seedTargets={seedTargets}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Shared shell: sliders + instant local metrics + deterministic compute
// ----------------------------------------------------------------------

interface SandboxShellProps {
  title: string;
  description: string;
  positions: PositionSeed[];
  equity: number;
  cap: number | null;
  targets: Record<string, number>;
  onTargetsChange: (next: Record<string, number>) => void;
  presets: { label: string; apply: (current: Record<string, number>) => Record<string, number> }[];
  extraControls?: ReactNode;
  runCompute: () => Promise<SandboxComputedResult | null>;
  buildAiBody: () => InsightGenerateBody;
  renderResult: (
    data: SandboxComputedResult["data"],
    pack: EvidencePack,
    onFocusRow: (focus: AiFocus) => void,
    focusedSymbol: string | null,
  ) => ReactNode;
  emptyHint: string;
}

interface LocalMetrics {
  cashPct: number;
  maxPosPct: number;
  turnover: number;
  fee: number;
  overCap: boolean;
}

function computeLocal(
  positions: PositionSeed[],
  targets: Record<string, number>,
  equity: number,
  cap: number | null,
): LocalMetrics {
  let sum = 0;
  let turnover = 0;
  let sellValue = 0;
  for (const position of positions) {
    const target = targets[position.symbol] ?? position.weightPct;
    sum += target;
    const deltaValue = ((target - position.weightPct) / 100) * equity;
    turnover += Math.abs(deltaValue);
    if (deltaValue < 0 && position.market.toLowerCase() === "cn") {
      sellValue += Math.abs(deltaValue);
    }
  }
  const maxPosPct = positions.reduce(
    (max, position) => Math.max(max, targets[position.symbol] ?? 0),
    0,
  );
  return {
    cashPct: 100 - sum,
    maxPosPct,
    turnover,
    fee: turnover * FEE_RATE + sellValue * STAMP_DUTY_RATE,
    overCap: cap != null && maxPosPct > cap + 0.05,
  };
}

function SandboxShell({
  title,
  description,
  positions,
  equity,
  cap,
  targets,
  onTargetsChange,
  presets,
  extraControls,
  runCompute,
  buildAiBody,
  renderResult,
  emptyHint,
}: SandboxShellProps) {
  const [computed, setComputed] = useState<SandboxComputedResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState(0);
  const [focus, setFocus] = useState<AiFocus | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [planName, setPlanName] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLANS_STORAGE_KEY);
      if (raw) setSavedPlans(JSON.parse(raw) as SavedPlan[]);
    } catch {
      // storage unavailable — saving stays disabled
    }
  }, []);

  const persistPlans = useCallback((plans: SavedPlan[]) => {
    setSavedPlans(plans);
    try {
      window.localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
    } catch {
      // ignore quota/availability errors
    }
  }, []);

  const savePlan = useCallback(() => {
    const name = planName.trim() || `方案 ${savedPlans.length + 1}`;
    persistPlans([
      ...savedPlans,
      {
        id: `${Date.now()}`,
        name,
        savedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        targets: { ...targets },
      },
    ]);
    setPlanName("");
    setSavingPlan(false);
  }, [planName, persistPlans, savedPlans, targets]);

  const loadPlan = useCallback(
    (plan: SavedPlan) => {
      onTargetsChange({ ...plan.targets });
      setFocus(null);
    },
    [onTargetsChange],
  );

  const deletePlan = useCallback(
    (id: string) => persistPlans(savedPlans.filter((plan) => plan.id !== id)),
    [persistPlans, savedPlans],
  );

  const metrics = useMemo(
    () => computeLocal(positions, targets, equity, cap),
    [positions, targets, equity, cap],
  );

  const dirty = useMemo(
    () => positions.some((position) => Math.abs((targets[position.symbol] ?? position.weightPct) - position.weightPct) > 0.05),
    [positions, targets],
  );

  const compute = useCallback(async () => {
    setComputing(true);
    setError(null);
    const result = await runCompute();
    setComputing(false);
    if (result) setComputed(result);
    else setError("推演失败，请检查持仓数据或稍后重试");
  }, [runCompute]);

  const money = (value: number) =>
    `¥${Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-full min-h-0 items-stretch gap-6">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-normal tracking-[-0.02em]">{title}</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void compute()}
              disabled={computing || positions.length === 0}
              className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {computing ? <LoaderIcon className="size-4 animate-spin" /> : <SlidersHorizontalIcon className="size-4" />}
              {computing ? "推演中" : "生成证据包"}
            </button>
            <button
              type="button"
              onClick={() => setAiRequest((value) => value + 1)}
              disabled={!computed}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40"
            >
              <SparklesIcon className="size-4" />
              AI 解读
            </button>
          </div>
        </div>

        <section className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border flex flex-wrap items-center gap-2 border-b px-6 py-3.5">
            <span className="text-foreground text-sm font-semibold">目标权重</span>
            <span className="text-muted-foreground text-xs">拖动即时预演，不发起请求</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onTargetsChange(preset.apply(targets))}
                  className="border-border text-foreground/70 hover:bg-muted rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 px-6 py-4">
            {positions.map((position) => {
              const target = targets[position.symbol] ?? position.weightPct;
              const delta = target - position.weightPct;
              return (
                <div key={position.symbol} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium">
                    {position.name}
                    <span className="text-muted-foreground ml-1.5 tabular-nums">{position.symbol}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={0.1}
                    value={target}
                    onChange={(event) =>
                      onTargetsChange({
                        ...targets,
                        [position.symbol]: Number(event.target.value),
                      })
                    }
                    className="min-w-0 flex-1"
                  />
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                    {target.toFixed(1)}%
                  </span>
                  <span
                    className={cn(
                      "w-16 shrink-0 text-right text-xs tabular-nums",
                      delta < -0.05 && "text-[#3f6218]",
                      delta > 0.05 && "text-[#b91c1c]",
                      Math.abs(delta) <= 0.05 && "text-muted-foreground",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}pp
                  </span>
                </div>
              );
            })}
            {extraControls ? <div className="pt-1">{extraControls}</div> : null}
            <AllocationBar positions={positions} targets={targets} />
          </div>
          <div className="border-border flex flex-wrap items-center gap-2 border-t px-6 py-3">
            <span className="text-muted-foreground text-[11px]">方案留存</span>
            {savingPlan ? (
              <>
                <input
                  value={planName}
                  onChange={(event) => setPlanName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") savePlan();
                  }}
                  autoFocus
                  placeholder="方案名称"
                  className="border-border w-36 rounded-md border bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={savePlan}
                  className="bg-foreground text-background rounded-md px-2.5 py-1 text-[11px] font-medium"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setSavingPlan(false)}
                  className="border-border text-foreground/70 rounded-md border px-2.5 py-1 text-[11px]"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSavingPlan(true)}
                className="border-border text-foreground/70 hover:bg-muted rounded-full border px-2.5 py-1 text-[11px] transition-colors"
              >
                + 保存当前权重
              </button>
            )}
            {savedPlans.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-[11px]">已存</span>
                {savedPlans.map((plan) => (
                  <span
                    key={plan.id}
                    className="border-border bg-muted/50 group inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[11px]"
                  >
                    <button type="button" onClick={() => loadPlan(plan)} className="hover:text-foreground text-foreground/70 transition-colors">
                      {plan.name}
                      <span className="text-muted-foreground ml-1 tabular-nums">{plan.savedAt.slice(5)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlan(plan.id)}
                      aria-label={`删除方案 ${plan.name}`}
                      className="text-muted-foreground/60 hover:text-[#b91c1c] rounded-full px-1 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCell
            label="最大单一持仓"
            value={`${metrics.maxPosPct.toFixed(1)}%`}
            hint={metrics.overCap && cap != null ? `超出上限 ${(metrics.maxPosPct - cap).toFixed(1)}pp` : cap != null ? `上限 ${cap.toFixed(0)}%` : "阈值未加载"}
            alert={metrics.overCap}
          />
          <MetricCell
            label="现金占比"
            value={`${metrics.cashPct.toFixed(1)}%`}
            hint={metrics.cashPct < 0 ? "目标权重合计已超过 100%" : "现金自动吸收差额"}
            alert={metrics.cashPct < 0}
          />
          <MetricCell label="合计换手" value={money(metrics.turnover)} hint="按当前收盘价折算" />
          <MetricCell label="费用 + 印花税" value={money(metrics.fee)} hint="佣金 0.05% + A 股卖出 0.05%" />
        </div>

        <p className="text-muted-foreground text-xs">
          以上四项为本地即时估算，用于拖动时的手感反馈；权威数字以「生成证据包」后返回的证据包为准。
        </p>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#f3c5c5] bg-[#FFF7F7] px-6 py-4">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-[#b91c1c]" />
            <p className="text-sm text-[#b91c1c]">{error}</p>
          </div>
        ) : null}

        {computed ? (
          renderResult(computed.data, computed.pack, (next) => {
            setFocus((current) => (current?.id === next.id ? null : next));
          }, focus?.id ?? null)
        ) : (
          <div className="border-border flex min-h-[160px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
            <SlidersHorizontalIcon className="text-foreground/40 size-6" />
            <p className="text-muted-foreground mt-3 max-w-md text-sm leading-6">{emptyHint}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {dirty ? "已调整权重，点「生成证据包」查看确定性结果" : "拖动上方滑块开始预演"}
            </p>
          </div>
        )}

      </div>

      <aside className="border-border bg-card sticky top-0 hidden h-[calc(100vh_-_8rem)] w-[300px] shrink-0 self-start overflow-hidden rounded-2xl border xl:block">
        <AiSidePanel
          pack={computed?.pack ?? null}
          packType="sandbox"
          buildAiBody={buildAiBody}
          openSignal={aiRequest}
          ready={computed != null}
          readyHint="先生成证据包，再让 AI 基于推演结果解读。"
          focus={focus}
          onClearFocus={() => setFocus(null)}
        />
      </aside>
    </div>
  );
}

const SEGMENT_COLORS = ["#378ADD", "#1D9E75", "#BA7517", "#7F77DD", "#D85A30"];
const PLANS_STORAGE_KEY = "portfolio-sandbox-plans";

interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  targets: Record<string, number>;
}

/** Live structure of the proposed portfolio: segments re-flow as sliders move. */
function AllocationBar({
  positions,
  targets,
}: {
  positions: PositionSeed[];
  targets: Record<string, number>;
}) {
  const invested = positions.reduce((sum, p) => sum + (targets[p.symbol] ?? p.weightPct), 0);
  const cash = Math.max(0, 100 - invested);
  const segments = positions.map((position, index) => ({
    key: position.symbol,
    label: position.name || position.symbol,
    value: Math.max(0, targets[position.symbol] ?? position.weightPct),
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
  }));
  segments.push({ key: "__cash", label: "现金", value: cash, color: "#D3D1C7" });
  const overflow = invested > 100;

  return (
    <div className="border-border mt-1 border-t pt-3">
      <div className="flex h-6 w-full overflow-hidden rounded-md">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              title={`${segment.label} ${segment.value.toFixed(1)}%`}
              style={{ flexGrow: segment.value, background: segment.color }}
              className="flex items-center justify-center text-[10px] text-white/90"
            >
              {segment.value >= 9 ? `${segment.value.toFixed(0)}%` : null}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block size-2 shrink-0 rounded-sm"
              style={{ background: segment.color }}
            />
            {segment.label}
            <span className="tabular-nums">{segment.value.toFixed(1)}%</span>
          </span>
        ))}
        {overflow ? (
          <span className="text-[11px] text-[#b91c1c]">
            目标权重合计 {invested.toFixed(1)}%，已超过 100%
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-card border-border rounded-2xl border px-5 py-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1.5 font-serif text-2xl tabular-nums",
          alert && "text-[#b91c1c]",
        )}
      >
        {value}
      </div>
      <p className={cn("mt-1 text-xs tabular-nums", alert ? "text-[#b91c1c]" : "text-muted-foreground")}>
        {hint}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------
// What-if
// ----------------------------------------------------------------------

/** Applies target weights handed over from the strategy view, once per seed. */
function useSeedTargets(
  seedTargets: Record<string, number> | null | undefined,
  setTargets: (next: Record<string, number>) => void,
) {
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = seedTargets ? JSON.stringify(seedTargets) : null;
    if (!key || key === appliedRef.current) return;
    appliedRef.current = key;
    setTargets(seedTargets);
  }, [seedTargets, setTargets]);
}

function WhatIfSandbox({
  accountId,
  positions,
  equity,
  cap,
  seedTargets,
}: {
  accountId: number;
  positions: PositionSeed[];
  equity: number;
  cap: number | null;
  seedTargets?: Record<string, number> | null;
}) {
  const [targets, setTargets] = useState<Record<string, number>>({});
  useSeedTargets(seedTargets, setTargets);

  const resolved = useMemo(() => {
    const map: Record<string, number> = {};
    for (const position of positions) {
      map[position.symbol] = targets[position.symbol] ?? position.weightPct;
    }
    return map;
  }, [positions, targets]);

  const adjustments = useMemo(
    () =>
      positions
        .map((position) => ({
          symbol: position.symbol,
          delta_weight_pct: Number(
            ((resolved[position.symbol] ?? position.weightPct) - position.weightPct).toFixed(2),
          ),
        }))
        .filter((entry) => Math.abs(entry.delta_weight_pct) > 0.05),
    [positions, resolved],
  );

  const presets = useMemo(
    () => [
      {
        label: "回到现状",
        apply: () => Object.fromEntries(positions.map((p) => [p.symbol, p.weightPct])),
      },
      {
        label: "压回上限",
        apply: (current: Record<string, number>) => {
          const limit = cap ?? 35;
          return Object.fromEntries(
            positions.map((p) => [p.symbol, Math.min(current[p.symbol] ?? p.weightPct, limit)]),
          );
        },
      },
      {
        label: "等权",
        apply: (current: Record<string, number>) => {
          const cashPct = 100 - positions.reduce((sum, p) => sum + (current[p.symbol] ?? p.weightPct), 0);
          const each = (100 - cashPct) / Math.max(1, positions.length);
          return Object.fromEntries(positions.map((p) => [p.symbol, Number(each.toFixed(1))]));
        },
      },
      {
        label: "超限仓减半",
        apply: (current: Record<string, number>) => {
          const limit = cap ?? 35;
          return Object.fromEntries(
            positions.map((p) => {
              const value = current[p.symbol] ?? p.weightPct;
              return [p.symbol, value > limit ? Number((value / 2).toFixed(1)) : value];
            }),
          );
        },
      },
    ],
    [positions, cap],
  );

  const runCompute = useCallback(
    () => runSandboxWhatIf({ account_id: accountId, adjustments }),
    [accountId, adjustments],
  );

  const buildAiBody = useCallback<() => InsightGenerateBody>(
    () => ({ account_id: accountId, sandbox: { mode: "what_if", adjustments } }),
    [accountId, adjustments],
  );

  return (
    <SandboxShell
      title="模拟沙盘 · 调仓 what-if"
      description="拖动目标权重即可即时预演集中度、现金与换手成本；点「生成证据包」得到可追溯的确定性结果，AI 解读按需触发，不再阻塞推演。"
      positions={positions}
      equity={equity}
      cap={cap}
      targets={resolved}
      onTargetsChange={setTargets}
      presets={presets}
      runCompute={runCompute}
      buildAiBody={buildAiBody}
      emptyHint="用当前真实持仓与缓存收盘价，确定性重算权重调整后的集中度与现金水平——只做算术，不做任何收益预测。"
      renderResult={(data, pack, onFocusRow, focusedSymbol) => (
        <WhatIfStructured
          data={data}
          pack={pack}
          onFocusRow={onFocusRow}
          focusedSymbol={focusedSymbol}
        />
      )}
    />
  );
}

function WhatIfStructured({
  data,
  pack,
  onFocusRow,
  focusedSymbol,
}: {
  data: SandboxComputedResult["data"];
  pack: EvidencePack;
  onFocusRow: (focus: AiFocus) => void;
  focusedSymbol: string | null;
}) {
  const whatIf = data as unknown as WhatIfData;
  const triggered = pack.rules.filter((rule) => rule.triggered);
  const appliedDeltas = whatIf.positions
    .map((row) => ({ symbol: row.symbol, delta: row.weight_after_pct - row.weight_before_pct }))
    .filter((entry) => Math.abs(entry.delta) > 0.005);

  return (
    <div className="space-y-5">
      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-2xl border px-6 py-3.5">
        <span className="text-muted-foreground text-xs font-medium">证据包输入</span>
        {appliedDeltas.length > 0 ? (
          appliedDeltas.map((entry) => (
            <span
              key={entry.symbol}
              className="border-border bg-muted/60 rounded-md border px-2 py-0.5 text-xs tabular-nums"
            >
              {entry.symbol} {entry.delta > 0 ? "+" : ""}
              {entry.delta.toFixed(1)}pp
            </span>
          ))
        ) : (
          <span className="text-muted-foreground text-xs">无调整（基线状态）</span>
        )}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          证据包 {pack.pack_id.slice(0, 8)} · 触发规则 {triggered.length} 条
        </span>
      </div>

      <div className="border-border bg-card grid grid-cols-2 gap-[1px] overflow-hidden rounded-2xl border md:grid-cols-4">
        <CompareCell
          label="最大单一持仓权重"
          before={whatIf.max_position_weight_before_pct}
          after={whatIf.max_position_weight_after_pct}
        />
        <CompareCell
          label="现金占比"
          before={whatIf.cash_weight_before_pct}
          after={whatIf.cash_weight_after_pct}
        />
        <div className="bg-card px-6 py-5">
          <div className="text-muted-foreground text-xs">调整后触发规则</div>
          <div className="mt-1.5 font-serif text-2xl tabular-nums">
            {triggered.length}
            <span className="text-muted-foreground ml-1 text-xs font-normal">条</span>
          </div>
        </div>
        <div className="bg-card px-6 py-5">
          <div className="text-muted-foreground text-xs">总净值（不变）</div>
          <div className="mt-1.5 font-serif text-2xl tabular-nums">
            {whatIf.total_equity != null
              ? `¥${whatIf.total_equity.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
              : "—"}
          </div>
        </div>
      </div>

      <section className="border-border bg-card overflow-hidden rounded-2xl border">
        <div className="border-border border-b px-6 py-4">
          <h3 className="text-foreground text-sm font-semibold">权重变化对比</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-xs">
              <th className="px-6 py-2.5 font-medium">标的</th>
              <th className="px-4 py-2.5 text-right font-medium">调整前</th>
              <th className="px-4 py-2.5 text-right font-medium">调整后</th>
              <th className="px-6 py-2.5 text-right font-medium">变化</th>
            </tr>
          </thead>
          <tbody>
            {whatIf.positions.map((row) => {
              const delta = row.weight_after_pct - row.weight_before_pct;
              const focused = focusedSymbol === row.symbol;
              return (
                <tr
                  key={row.symbol}
                  onClick={() =>
                    onFocusRow({
                      id: row.symbol,
                      label: (row.name && row.name !== row.symbol ? row.name : row.symbol) || row.symbol,
                      detail: `${row.symbol} · ${row.weight_before_pct.toFixed(1)}% → ${row.weight_after_pct.toFixed(1)}%`,
                    })
                  }
                  className={cn(
                    "border-border/60 hover:bg-muted/40 cursor-pointer border-b transition-colors last:border-0",
                    focused && "bg-muted/50",
                  )}
                >
                  <td className="px-6 py-2.5 font-medium">
                    {row.name && row.name !== row.symbol ? row.name : row.symbol}
                    {row.name && row.name !== row.symbol ? (
                      <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">{row.symbol}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.weight_before_pct.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.weight_after_pct.toFixed(2)}%</td>
                  <td
                    className={cn(
                      "px-6 py-2.5 text-right font-medium tabular-nums",
                      delta > 0 && "text-[#b91c1c]",
                      delta < 0 && "text-[#3f6218]",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(2)}pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CompareCell({
  label,
  before,
  after,
}: {
  label: string;
  before: number | null;
  after: number | null;
}) {
  const delta = before != null && after != null ? after - before : null;
  return (
    <div className="bg-card px-6 py-5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1.5 font-serif text-2xl tabular-nums">{after != null ? `${after.toFixed(1)}%` : "—"}</div>
      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        调整前 {before != null ? `${before.toFixed(1)}%` : "—"}
        {delta != null && delta !== 0 ? `（${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp）` : ""}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------
// Scenario replay
// ----------------------------------------------------------------------

function ScenarioSandbox({
  accountId,
  positions,
  equity,
  cap,
  seedTargets,
}: {
  accountId: number;
  positions: PositionSeed[];
  equity: number;
  cap: number | null;
  seedTargets?: Record<string, number> | null;
}) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 60);
  const [startDate, setStartDate] = useState(toISODate(defaultStart));
  const [endDate, setEndDate] = useState(toISODate(today));
  const [targets, setTargets] = useState<Record<string, number>>({});
  useSeedTargets(seedTargets, setTargets);

  const resolved = useMemo(() => {
    const map: Record<string, number> = {};
    for (const position of positions) {
      map[position.symbol] = targets[position.symbol] ?? position.weightPct;
    }
    return map;
  }, [positions, targets]);

  const proposedWeights = useMemo(() => {
    const result: Record<string, number> = {};
    for (const position of positions) {
      result[position.symbol] = Math.max(0, resolved[position.symbol] ?? 0) / 100;
    }
    return result;
  }, [positions, resolved]);

  const presets = useMemo(
    () => [
      {
        label: "回到现状",
        apply: () => Object.fromEntries(positions.map((p) => [p.symbol, p.weightPct])),
      },
      {
        label: "压回上限",
        apply: (current: Record<string, number>) => {
          const limit = cap ?? 35;
          return Object.fromEntries(
            positions.map((p) => [p.symbol, Math.min(current[p.symbol] ?? p.weightPct, limit)]),
          );
        },
      },
      {
        label: "等权",
        apply: (current: Record<string, number>) => {
          const cashPct = 100 - positions.reduce((sum, p) => sum + (current[p.symbol] ?? p.weightPct), 0);
          const each = (100 - cashPct) / Math.max(1, positions.length);
          return Object.fromEntries(positions.map((p) => [p.symbol, Number(each.toFixed(1))]));
        },
      },
    ],
    [positions, cap],
  );

  const runCompute = useCallback(
    () =>
      runSandboxScenario({
        account_id: accountId,
        start_date: startDate,
        end_date: endDate,
        proposed_weights: proposedWeights,
      }),
    [accountId, startDate, endDate, proposedWeights],
  );

  const buildAiBody = useCallback<() => InsightGenerateBody>(
    () => ({
      account_id: accountId,
      sandbox: { mode: "scenario", start_date: startDate, end_date: endDate, proposed_weights: proposedWeights },
    }),
    [accountId, startDate, endDate, proposedWeights],
  );

  return (
    <SandboxShell
      title="模拟沙盘 · 历史情景回放"
      description="把拟定权重放回真实历史行情中做确定性投影：组合日收益 = Σ 权重 × 个股真实日收益。不预测未来，不含费用与滑点。"
      positions={positions}
      equity={equity}
      cap={cap}
      targets={resolved}
      onTargetsChange={setTargets}
      presets={presets}
      extraControls={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">回放区间</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="border-border rounded-md border bg-transparent px-2 py-1 text-xs tabular-nums"
          />
          <span className="text-muted-foreground">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="border-border rounded-md border bg-transparent px-2 py-1 text-xs tabular-nums"
          />
        </div>
      }
      runCompute={runCompute}
      buildAiBody={buildAiBody}
      emptyHint="设定回放区间与拟定权重后，点「生成证据包」查看这段真实行情里的确定性投影。"
      renderResult={(data, pack, onFocusRow, focusedSymbol) => (
        <ScenarioStructured
          data={data}
          pack={pack}
          onFocusRow={onFocusRow}
          focusedSymbol={focusedSymbol}
        />
      )}
    />
  );
}

function ScenarioStructured({
  data,
  pack,
  onFocusRow,
  focusedSymbol,
}: {
  data: SandboxComputedResult["data"];
  pack: EvidencePack;
  onFocusRow: (focus: AiFocus) => void;
  focusedSymbol: string | null;
}) {
  const scenario = data as unknown as ScenarioData;
  const chartPoints = scenario.series.filter((point) => point.proposed_equity != null);

  return (
    <div className="space-y-5">
      <div className="border-border bg-card grid grid-cols-2 gap-[1px] overflow-hidden rounded-2xl border md:grid-cols-4">
        <ReturnCell label="基线组合收益" value={scenario.baseline_return_pct} />
        <ReturnCell label="实验组合收益" value={scenario.proposed_return_pct} />
        <ReturnCell label="基线最大回撤" value={scenario.baseline_max_drawdown_pct} negative />
        <ReturnCell label="实验最大回撤" value={scenario.proposed_max_drawdown_pct} negative />
      </div>

      {chartPoints.length >= 2 ? (
        <section className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border flex flex-wrap items-center gap-4 border-b px-6 py-4">
            <h3 className="text-foreground text-sm font-semibold">投影净值（起点 = 100）</h3>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="inline-block h-0.5 w-5 bg-[#8d867c]" /> 基线（当前权重）
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="inline-block h-0.5 w-5 bg-[#3f6218]" /> 实验（拟定权重）
            </span>
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {scenario.start_date} ~ {scenario.end_date} · {chartPoints.length} 个交易日
            </span>
          </div>
          <div className="px-3 py-4">
            <ScenarioChart points={chartPoints} />
          </div>
        </section>
      ) : null}

      <div className="border-border bg-card rounded-2xl border px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-foreground text-sm font-semibold">本次回放输入</h3>
          <span className="border-border bg-muted/60 rounded-md border px-2 py-0.5 text-xs tabular-nums">
            {scenario.start_date} ~ {scenario.end_date}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {Object.entries(scenario.weights_used).map(([symbol, weight]) => (
            <button
              key={symbol}
              type="button"
              onClick={() =>
                onFocusRow({
                  id: symbol,
                  label: symbol,
                  detail: `回放权重 ${(weight * 100).toFixed(1)}%`,
                })
              }
              className={cn(
                "border-border bg-muted/60 hover:bg-muted rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                focusedSymbol === symbol && "ring-2 ring-[#c9a86a]",
              )}
            >
              {symbol} {(weight * 100).toFixed(1)}%
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          固定权重逐日投影、现金收益记 0；历史确定性回放不代表未来收益（证据包 {pack.pack_id.slice(0, 8)}）。
        </p>
      </div>
    </div>
  );
}

function ReturnCell({
  label,
  value,
  negative,
}: {
  label: string;
  value: number | null;
  negative?: boolean;
}) {
  const tone =
    value == null || value === 0
      ? undefined
      : negative
        ? value > 0
          ? "down"
          : "up"
        : value > 0
          ? "up"
          : "down";
  return (
    <div className="bg-card px-6 py-5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1.5 font-serif text-2xl tabular-nums",
          tone === "up" && "text-[#b91c1c]",
          tone === "down" && "text-[#3f6218]",
        )}
      >
        {value != null ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

const W = 720;
const H = 200;
const PAD = 10;

interface ChartPoint {
  date: string;
  baseline_equity: number;
  proposed_equity?: number | null;
}

function ScenarioChart({ points }: { points: ChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { baseline, proposed } = useMemo(() => {
    const values = points.flatMap((point) => [
      point.baseline_equity,
      point.proposed_equity ?? point.baseline_equity,
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const xAt = (index: number) => (index / Math.max(1, points.length - 1)) * W;
    const yAt = (value: number) => H - PAD - ((value - min) / span) * (H - PAD * 2);
    let baseline = "";
    let proposed = "";
    points.forEach((point, index) => {
      const command = index === 0 ? "M" : "L";
      baseline += `${command}${xAt(index).toFixed(1)} ${yAt(point.baseline_equity).toFixed(1)} `;
      proposed += `${command}${xAt(index).toFixed(1)} ${yAt(point.proposed_equity ?? point.baseline_equity).toFixed(1)} `;
    });
    return { baseline, proposed };
  }, [points]);

  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const node = containerRef.current;
      if (!node || points.length < 2) return;
      const rect = node.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
      const index = Math.round(ratio * (points.length - 1));
      setHover(Math.max(0, Math.min(points.length - 1, index)));
    },
    [points.length],
  );

  const hoverPoint = hover != null ? points[hover] : null;
  const prevPoint = hover != null && hover > 0 ? points[hover - 1] : null;
  const baselineDayChange =
    hoverPoint && prevPoint ? hoverPoint.baseline_equity - prevPoint.baseline_equity : null;
  const proposedDayChange =
    hoverPoint && prevPoint && hoverPoint.proposed_equity != null && prevPoint.proposed_equity != null
      ? hoverPoint.proposed_equity - prevPoint.proposed_equity
      : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none" aria-hidden>
        <path d={baseline} fill="none" stroke="#8d867c" strokeWidth="2" strokeDasharray="5 4" />
        <path d={proposed} fill="none" stroke="#3f6218" strokeWidth="2.5" strokeLinecap="round" />
        {hover != null ? (
          <line
            x1={(hover / Math.max(1, points.length - 1)) * W}
            y1={PAD}
            x2={(hover / Math.max(1, points.length - 1)) * W}
            y2={H - PAD}
            stroke="#888780"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}
      </svg>

      {hoverPoint ? (
        <div
          className="bg-card border-border pointer-events-none absolute top-0 z-10 w-36 -translate-x-1/2 rounded-lg border px-2.5 py-2 text-[11px] leading-5"
          style={{
            left: `${(hover! / Math.max(1, points.length - 1)) * 100}%`,
            top: 0,
          }}
        >
          <div className="text-muted-foreground tabular-nums">{hoverPoint.date}</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">基线</span>
            <span className="text-foreground tabular-nums">
              {hoverPoint.baseline_equity.toFixed(2)}
              {baselineDayChange != null ? (
                <span className={cn("ml-1", baselineDayChange >= 0 ? "text-[#b91c1c]" : "text-[#3f6218]")}>
                  {baselineDayChange >= 0 ? "+" : ""}
                  {baselineDayChange.toFixed(2)}
                </span>
              ) : null}
            </span>
          </div>
          {hoverPoint.proposed_equity != null ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">实验</span>
              <span className="text-foreground tabular-nums">
                {hoverPoint.proposed_equity.toFixed(2)}
                {proposedDayChange != null ? (
                  <span className={cn("ml-1", proposedDayChange >= 0 ? "text-[#b91c1c]" : "text-[#3f6218]")}>
                    {proposedDayChange >= 0 ? "+" : ""}
                    {proposedDayChange.toFixed(2)}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
