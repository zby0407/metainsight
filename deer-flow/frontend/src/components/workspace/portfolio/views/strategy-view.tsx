"use client";

import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  LoaderIcon,
  ScaleIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { type EnrichedPosition } from "@/core/portfolio";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import {
  fetchStrategyCandidates,
  type InsightGenerateBody,
  type StrategyCandidate,
  type StrategyData,
} from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { AiSidePanel, type AiFocus } from "../evidence/ai-side-panel";
import { RebalanceSection } from "../evidence/rebalance-section";

const ACTION_LABELS: Record<StrategyCandidate["action"], string> = {
  reduce: "减持",
  add: "增持",
  rebalance: "再平衡",
  hold: "持有",
  review: "复核",
};

type SortKey = "severity" | "turnover" | "fee";

type RuleKey = "all" | "single_position_cap" | "stop_loss" | "weight_drift" | "cash_floor";

const RULE_LABELS: Record<RuleKey, string> = {
  all: "全部",
  single_position_cap: "超单一上限",
  stop_loss: "触发止损",
  weight_drift: "权重漂移",
  cash_floor: "现金底仓",
};

interface PositionSeed {
  symbol: string;
  name: string;
  weightPct: number;
}

export function StrategyView({
  item,
  onPushToSandbox,
}: {
  item: PortfolioDashboardItem;
  onPushToSandbox?: (targets: Record<string, number>) => void;
}) {
  const accountId = Number(item.portfolio.id);
  const [result, setResult] = useState<{ pack: EvidencePack; data: StrategyData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [ruleFilter, setRuleFilter] = useState<RuleKey>("all");

  const equity = Number(item.latestSnapshot?.totalEquity ?? 0);
  const positions = useMemo<PositionSeed[]>(
    () =>
      ((item.positions ?? []) as EnrichedPosition[])
        .map((position) => {
          const marketValue = Number(position.marketValue ?? 0);
          return {
            symbol: position.symbol,
            name: position.name ?? position.symbol,
            weightPct: equity > 0 ? (marketValue / equity) * 100 : 0,
          };
        })
        .filter((position) => position.weightPct > 0)
        .sort((a, b) => b.weightPct - a.weightPct),
    [item.positions, equity],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchStrategyCandidates({ account_id: Number.isFinite(accountId) ? accountId : null }).then(
      (next) => {
        setLoading(false);
        if (next) setResult(next);
        else setError("策略候选加载失败，请稍后重试");
      },
    );
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const buildAiBody = useCallback<() => InsightGenerateBody>(
    () => ({ account_id: accountId }),
    [accountId],
  );

  const candidates = useMemo(() => result?.data.candidates ?? [], [result]);

  const severityOf = useCallback((candidate: StrategyCandidate) => {
    if (candidate.current_value != null && candidate.threshold != null) {
      return Math.abs(candidate.current_value - candidate.threshold);
    }
    return 0;
  }, []);

  const counts = useMemo(() => {
    const map: Record<RuleKey, number> = {
      all: candidates.length,
      single_position_cap: 0,
      stop_loss: 0,
      weight_drift: 0,
      cash_floor: 0,
    };
    for (const candidate of candidates) {
      if (candidate.rule_name in map) map[candidate.rule_name as RuleKey] += 1;
    }
    return map;
  }, [candidates]);

  const visible = useMemo(() => {
    const list = candidates.filter(
      (candidate) => ruleFilter === "all" || candidate.rule_name === ruleFilter,
    );
    const valueOf = (candidate: StrategyCandidate) =>
      sortKey === "turnover"
        ? (candidate.expected_effect?.estimated_turnover ?? 0)
        : sortKey === "fee"
          ? (candidate.expected_effect?.estimated_fee ?? 0)
          : severityOf(candidate);
    return [...list].sort((a, b) => valueOf(b) - valueOf(a));
  }, [candidates, ruleFilter, sortKey, severityOf]);

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selected[candidate.candidate_id]),
    [candidates, selected],
  );

  const totals = useMemo(
    () => ({
      turnover: selectedCandidates.reduce(
        (sum, candidate) => sum + (candidate.expected_effect?.estimated_turnover ?? 0),
        0,
      ),
      fee: selectedCandidates.reduce(
        (sum, candidate) => sum + (candidate.expected_effect?.estimated_fee ?? 0),
        0,
      ),
    }),
    [selectedCandidates],
  );

  /** Translate the picked candidates into a full target-weight map. */
  const pushToSandbox = useCallback(() => {
    if (!onPushToSandbox) return;
    const targets: Record<string, number> = {};
    for (const position of positions) targets[position.symbol] = position.weightPct;
    for (const candidate of selectedCandidates) {
      const symbol = candidate.target_symbol;
      if (!symbol || !(symbol in targets)) continue;
      if (candidate.rule_name === "single_position_cap" || candidate.rule_name === "weight_drift") {
        if (candidate.threshold != null) targets[symbol] = candidate.threshold;
      }
    }
    onPushToSandbox(targets);
  }, [onPushToSandbox, positions, selectedCandidates]);

  const focus = useMemo<AiFocus | null>(() => {
    const candidate = candidates.find((item) => item.candidate_id === focusedId);
    if (!candidate) return null;
    return {
      id: candidate.candidate_id,
      label:
        candidate.target_name && candidate.target_name !== candidate.target_symbol
          ? String(candidate.target_name)
          : (candidate.target_symbol ?? "组合层面"),
      detail: `${candidate.rule_name} · ${ACTION_LABELS[candidate.action]}`,
    };
  }, [candidates, focusedId]);

  const money = (value: number) =>
    `¥${Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;

  return (
    <div className="flex h-full min-h-0 items-stretch gap-6">
      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-normal tracking-[-0.02em]">策略建议</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
              由显式规则生成的候选调仓建议：每条都给出触发规则、当前值、阈值与确定性预期效果。勾选后可汇总并送去沙盘推演。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40"
            >
              <LoaderIcon className={cn("size-4", loading && "animate-spin")} />
              重新评估
            </button>
            <button
              type="button"
              onClick={() => setAiRequest((value) => value + 1)}
              disabled={!result}
              className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <SparklesIcon className="size-4" />
              AI 解读
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#f3c5c5] bg-[#FFF7F7] px-6 py-4">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-[#b91c1c]" />
            <p className="text-sm text-[#b91c1c]">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="bg-muted h-64 animate-pulse rounded-2xl" />
        ) : result ? (
          <StrategyBody
            pack={result.pack}
            candidates={candidates}
            visible={visible}
            counts={counts}
            sortKey={sortKey}
            onSortChange={setSortKey}
            ruleFilter={ruleFilter}
            onRuleFilterChange={setRuleFilter}
            selected={selected}
            onSelectedChange={setSelected}
            focusedId={focusedId}
            onFocusCandidate={(id) => setFocusedId((current) => (current === id ? null : id))}
            profileSource={result.data.profile_source}
          />
        ) : null}

        {selectedCandidates.length > 0 ? (
          <div className="bg-card border-border sticky bottom-0 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-6 py-3.5">
            <span className="text-sm">
              已选 <span className="font-medium tabular-nums">{selectedCandidates.length}</span> 条
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              合计换手 {money(totals.turnover)}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              估算费用 {money(totals.fee)}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected({})}
                className="border-border text-foreground/70 hover:bg-muted rounded-lg border px-3 py-1.5 text-xs transition-colors"
              >
                清空选择
              </button>
              <button
                type="button"
                onClick={pushToSandbox}
                disabled={!onPushToSandbox}
                className="bg-foreground text-background rounded-lg px-3.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                送去沙盘推演
              </button>
            </div>
          </div>
        ) : null}

        <RebalanceSection />
      </div>

      <aside className="border-border bg-card sticky top-0 hidden h-[calc(100vh_-_8rem)] w-[300px] shrink-0 self-start overflow-hidden rounded-2xl border xl:block">
        <AiSidePanel
          pack={result?.pack ?? null}
          packType="strategy"
          buildAiBody={buildAiBody}
          openSignal={aiRequest}
          ready={!loading && result != null}
          readyHint="候选加载完成后即可让 AI 基于证据解读。"
          focus={focus}
          onClearFocus={() => setFocusedId(null)}
        />
      </aside>
    </div>
  );
}

function StrategyBody({
  pack,
  candidates,
  visible,
  counts,
  sortKey,
  onSortChange,
  ruleFilter,
  onRuleFilterChange,
  selected,
  onSelectedChange,
  focusedId,
  onFocusCandidate,
  profileSource,
}: {
  pack: EvidencePack;
  candidates: StrategyCandidate[];
  visible: StrategyCandidate[];
  counts: Record<RuleKey, number>;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  ruleFilter: RuleKey;
  onRuleFilterChange: (key: RuleKey) => void;
  selected: Record<string, boolean>;
  onSelectedChange: (next: Record<string, boolean>) => void;
  focusedId: string | null;
  onFocusCandidate: (id: string) => void;
  profileSource: StrategyData["profile_source"];
}) {
  const triggered = new Set(pack.rules.filter((rule) => rule.triggered).map((rule) => rule.id));

  return (
    <div className="space-y-4">
      <div className="border-border bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-6 py-3.5 text-xs">
        <span className="text-muted-foreground">
          阈值来源：
          <span className="text-foreground font-medium">
            {profileSource === "investor_profile" ? "个人投资者画像" : "系统默认配置"}
          </span>
        </span>
        <span className="text-muted-foreground">
          规则检查 <span className="text-foreground tabular-nums">{pack.rules.length}</span> 条 · 触发{" "}
          <span className="tabular-nums text-[#b91c1c]">{triggered.size}</span> 条 · 候选建议{" "}
          <span className="text-foreground tabular-nums">{candidates.length}</span> 条
        </span>
        <span className="text-muted-foreground ml-auto tabular-nums">
          证据包 {pack.pack_id.slice(0, 8)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(RULE_LABELS) as RuleKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onRuleFilterChange(key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              ruleFilter === key
                ? "bg-foreground text-background border-foreground"
                : "border-border text-foreground/70 hover:bg-muted",
            )}
          >
            {RULE_LABELS[key]} {counts[key]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">排序</span>
          {(
            [
              ["severity", "超阈值幅度"],
              ["turnover", "换手金额"],
              ["fee", "费用"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSortChange(key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                sortKey === key
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-foreground/70 hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border-border flex min-h-[180px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
          <SearchIcon className="text-foreground/40 size-6" />
          <p className="text-muted-foreground mt-3 text-sm">
            {candidates.length === 0
              ? "所有规则检查通过，当前没有触发的调仓候选"
              : "该筛选条件下没有候选"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((candidate) => (
            <CandidateCard
              key={candidate.candidate_id}
              candidate={candidate}
              checked={!!selected[candidate.candidate_id]}
              focused={focusedId === candidate.candidate_id}
              onToggle={() =>
                onSelectedChange({
                  ...selected,
                  [candidate.candidate_id]: !selected[candidate.candidate_id],
                })
              }
              onFocus={() => onFocusCandidate(candidate.candidate_id)}
              triggered={triggered.has(candidate.rule_id ?? "")}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        候选建议全部由规则引擎确定性生成；费用估算使用固定费率，不代表实际成本。
      </p>
    </div>
  );
}

function CandidateCard({
  candidate,
  checked,
  focused,
  onToggle,
  onFocus,
  triggered,
}: {
  candidate: StrategyCandidate;
  checked: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
  triggered: boolean;
}) {
  const actionIcon =
    candidate.action === "reduce" ? (
      <ArrowDownIcon className="size-3.5" />
    ) : candidate.action === "add" ? (
      <ArrowUpIcon className="size-3.5" />
    ) : candidate.action === "rebalance" ? (
      <ScaleIcon className="size-3.5" />
    ) : (
      <SearchIcon className="size-3.5" />
    );

  const actionTone =
    candidate.action === "reduce"
      ? "bg-[#F1F9EE] text-[#3f6218]"
      : candidate.action === "add"
        ? "bg-[#FFF2F2] text-[#b91c1c]"
        : "bg-muted text-foreground/70";

  const effect = candidate.expected_effect;

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFocus();
        }
      }}
      className={cn(
        "border-border bg-card hover:border-foreground/30 cursor-pointer overflow-hidden rounded-2xl border outline-none transition-colors",
        checked && "border-foreground/40",
        focused && "ring-2 ring-[#c9a86a]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          className="size-4 cursor-pointer"
          aria-label={`选择 ${candidate.candidate_id}`}
        />
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold", actionTone)}>
          {actionIcon}
          {ACTION_LABELS[candidate.action]}
        </span>
        {candidate.target_symbol ? (
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {candidate.target_name && candidate.target_name !== candidate.target_symbol
              ? candidate.target_name
              : candidate.target_symbol}
            {candidate.target_name && candidate.target_name !== candidate.target_symbol ? (
              <span className="text-muted-foreground ml-1.5 text-xs">{candidate.target_symbol}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-foreground text-sm font-semibold">组合层面</span>
        )}
        {candidate.rule_id ? (
          <span
            className={cn(
              "border-border bg-muted/60 rounded border px-1 text-[10px] tabular-nums",
              triggered && "text-[#b91c1c]",
            )}
          >
            {candidate.rule_id}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs">{candidate.rule_name}</span>
      </div>

      <div className="px-6 py-3">
        <p className="text-sm leading-6">{candidate.trigger_rule}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-5">{candidate.rationale}</p>
      </div>

      {counterfactualFor(candidate) ? (
        <div className="mx-6 mb-3 flex items-start gap-2 rounded-xl border border-[#f0d9a8] bg-[#FDF6E7] px-4 py-3">
          <span className="mt-0.5 shrink-0 rounded bg-[#8a5a00]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
            如果不调整
          </span>
          <p className="text-xs leading-5 text-[#6e4a05]">{counterfactualFor(candidate)}</p>
        </div>
      ) : null}

      {effect ? (
        <div className="border-border bg-muted/40 grid grid-cols-3 gap-[1px] border-t">
          <EffectCell
            label={effect.post_metric_label || "调整后指标"}
            value={effect.post_metric_value != null ? `${effect.post_metric_value.toFixed(1)}%` : "—"}
          />
          <EffectCell
            label="估算换手金额"
            value={
              effect.estimated_turnover != null
                ? `¥${effect.estimated_turnover.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
                : "—"
            }
          />
          <EffectCell
            label="估算费用（0.05%）"
            value={
              effect.estimated_fee != null
                ? `¥${effect.estimated_fee.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
                : "—"
            }
          />
        </div>
      ) : null}
    </section>
  );
}

function EffectCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-6 py-3">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="text-foreground mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

/** Deterministic counterfactual: what happens if nothing changes. */
function counterfactualFor(candidate: StrategyCandidate): string | null {
  const current = candidate.current_value;
  const threshold = candidate.threshold;
  if (current == null) return null;

  switch (candidate.rule_name) {
    case "single_position_cap":
      if (threshold == null || current <= threshold) return null;
      return `${candidate.target_symbol ?? "该标的"}权重将保持 ${current.toFixed(1)}%，持续超出上限 ${(current - threshold).toFixed(1)} 个百分点`;
    case "cash_floor":
      if (threshold == null || current >= threshold) return null;
      return `现金占比将保持 ${current.toFixed(1)}%，持续低于底仓要求 ${(threshold - current).toFixed(1)} 个百分点`;
    case "stop_loss": {
      if (threshold == null || current >= threshold) return null;
      const overshoot = Math.abs(current) - Math.abs(threshold);
      return `浮亏将维持在 ${current.toFixed(1)}%，已越过止损线 ${Math.abs(threshold).toFixed(1)}%（超出 ${overshoot.toFixed(1)}pp）`;
    }
    case "weight_drift":
      return `权重漂移将维持在当前水平，组合持续偏离再平衡阈值`;
    default:
      return null;
  }
}
