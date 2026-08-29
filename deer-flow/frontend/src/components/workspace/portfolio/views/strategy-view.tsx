"use client";

import { ArrowDownIcon, ArrowUpIcon, ScaleIcon, SearchIcon } from "lucide-react";
import { useMemo } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import type { InsightComputedPayload, StrategyCandidate } from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { InsightRunner } from "../evidence/insight-runner";

const ACTION_LABELS: Record<StrategyCandidate["action"], string> = {
  reduce: "减持",
  add: "增持",
  rebalance: "再平衡",
  hold: "持有",
  review: "复核",
};

export function StrategyView({ item }: { item: PortfolioDashboardItem }) {
  const accountId = Number(item.portfolio.id);
  const autoRunKey = useMemo(
    () => (Number.isFinite(accountId) ? `strategy|${accountId}` : null),
    [accountId],
  );

  return (
    <InsightRunner
      packType="strategy"
      accountId={Number.isFinite(accountId) ? accountId : null}
      title="策略建议"
      description="由显式规则生成的候选调仓建议：每条都给出触发规则、当前值、阈值与确定性预期效果。建议仅供决策参考，不会自动执行任何交易。"
      buildBody={() => ({ account_id: accountId })}
      autoRunKey={autoRunKey}
      runLabel="重新评估"
      renderStructured={(data, pack) => <StrategyStructured data={data} pack={pack} />}
    />
  );
}

function StrategyStructured({
  data,
  pack,
}: {
  data: InsightComputedPayload["data"];
  pack: EvidencePack;
}) {
  const strategy = data as unknown as {
    candidates: StrategyCandidate[];
    profile_source: "investor_profile" | "global_config";
  };
  const triggeredRuleIds = new Set(
    pack.rules.filter((rule) => rule.triggered).map((rule) => rule.id),
  );

  return (
    <div className="space-y-6">
      <div className="border-border bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-6 py-4 text-xs">
        <span className="text-muted-foreground">
          阈值来源：
          <span className="text-foreground font-medium">
            {strategy.profile_source === "investor_profile" ? "个人投资者画像" : "系统默认配置"}
          </span>
        </span>
        <span className="text-muted-foreground">
          规则检查 <span className="text-foreground tabular-nums">{pack.rules.length}</span> 条 · 触发{" "}
          <span className="tabular-nums text-[#b91c1c]">{triggeredRuleIds.size}</span> 条 · 候选建议{" "}
          <span className="text-foreground tabular-nums">{strategy.candidates.length}</span> 条
        </span>
      </div>

      {strategy.candidates.length === 0 ? (
        <div className="border-border flex min-h-[180px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
          <SearchIcon className="text-foreground/40 size-6" />
          <p className="text-muted-foreground mt-3 text-sm">
            所有规则检查通过，当前没有触发的调仓候选
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {strategy.candidates.map((candidate) => (
            <CandidateCard key={candidate.candidate_id} candidate={candidate} />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        候选建议全部由规则引擎确定性生成（证据包 {pack.pack_id.slice(0, 8)}）；费用估算使用固定费率，不代表实际成本。
      </p>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: StrategyCandidate }) {
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
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
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
              <span className="text-muted-foreground ml-1.5 text-xs">
                {candidate.target_symbol}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-foreground text-sm font-semibold">组合层面</span>
        )}
        {candidate.rule_id ? (
          <span className="text-muted-foreground border-border bg-muted/60 rounded border px-1 text-[10px] tabular-nums">
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
