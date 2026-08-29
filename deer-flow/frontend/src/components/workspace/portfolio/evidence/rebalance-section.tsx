"use client";

import { RotateCwIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  executeRebalancePlan,
  fetchRebalancePlan,
  type RebalanceExecutionResult,
  type RebalancePlan,
  type RebalanceTarget,
  type RebalanceTrade,
} from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { label: "30 天", days: 30 },
  { label: "90 天", days: 90 },
] as const;

export function RebalanceSection() {
  const [windowDays, setWindowDays] = useState<number>(90);
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<RebalanceExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setConfirming(false);
    setResult(null);
    setError(null);
    void fetchRebalancePlan(windowDays).then((next) => {
      setPlan(next);
      setLoading(false);
    });
  }, [windowDays]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useMemo(
    () =>
      (plan?.plan.targets ?? []).filter(
        (target) =>
          Math.abs(target.current_weight_pct - target.target_weight_pct) > 0.01 ||
          target.reasons.length > 0,
      ),
    [plan],
  );

  const weightScale = useMemo(
    () =>
      Math.max(
        1,
        ...(plan?.plan.targets ?? []).map((target) =>
          Math.max(target.current_weight_pct, target.target_weight_pct),
        ),
      ),
    [plan],
  );

  const execute = async () => {
    setExecuting(true);
    const outcome = await executeRebalancePlan(windowDays, plan?.plan.plan_id ?? null);
    setExecuting(false);
    setConfirming(false);
    if (outcome.error) {
      setResult(null);
      setError(outcome.error);
      // The plan we showed is stale; pull the recomputed one so the user sees
      // exactly what they would execute next time.
      load();
      return;
    }
    setError(null);
    if (outcome.result) setResult(outcome.result);
  };

  const tradeTotals = useMemo(() => {
    const trades = plan?.plan.trades ?? [];
    return {
      turnover: trades.reduce((sum, trade) => sum + trade.estimated_value, 0),
      fee: trades.reduce((sum, trade) => sum + trade.estimated_fee, 0),
      tax: trades.reduce((sum, trade) => sum + (trade.estimated_tax ?? 0), 0),
    };
  }, [plan]);

  const roundedTrades = useMemo(() => {
    const map = new Map<string, RebalanceTrade>();
    for (const trade of plan?.plan.trades ?? []) {
      if (trade.lot_rounded) map.set(trade.symbol, trade);
    }
    return map;
  }, [plan]);

  const comparison = plan?.comparison;

  return (
    <section>
      <div className="border-border flex flex-wrap items-baseline justify-between gap-3 border-t pt-3">
        <span className="text-muted-foreground text-[10px] font-bold tracking-[0.18em] uppercase">
          AI 调仓方案
        </span>
        <div className="flex items-center gap-2">
          <div className="border-border flex items-center gap-0.5 rounded-md border p-0.5">
            {WINDOWS.map((entry) => (
              <button
                key={entry.days}
                type="button"
                onClick={() => setWindowDays(entry.days)}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  windowDays === entry.days
                    ? "bg-foreground text-background"
                    : "text-foreground/55 hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {!confirming ? (
            <button
              type="button"
              disabled={!plan || plan.plan.trades.length === 0 || loading}
              onClick={() => setConfirming(true)}
              className="bg-foreground text-background inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ShieldCheckIcon className="size-3.5" />
              采纳执行
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-foreground/70">
                将写入 {plan?.plan.trades.length ?? 0} 笔交易，确认？
              </span>
              <button
                type="button"
                disabled={executing}
                onClick={() => void execute()}
                className="bg-[#b91c1c] rounded-md px-2.5 py-1.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {executing ? "执行中" : "确认执行"}
              </button>
              <button
                type="button"
                disabled={executing}
                onClick={() => setConfirming(false)}
                className="border-border text-foreground/70 hover:bg-muted rounded-md border px-2.5 py-1.5 transition-colors"
              >
                取消
              </button>
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-muted mt-4 h-40 animate-pulse rounded-xl" />
      ) : !plan ? (
        <p className="text-muted-foreground mt-4 text-sm">调仓方案暂不可用。</p>
      ) : (
        <div className="mt-4 space-y-5">
          {error ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#f2c9c9] bg-[#FFF2F2] px-4 py-2.5 text-xs text-[#b91c1c]">
              <span>{error}</span>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1 rounded border border-[#f2c9c9] px-2 py-0.5 font-medium transition-colors hover:bg-[#fde8e8]"
              >
                <RotateCwIcon className="size-3" />
                刷新方案
              </button>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-lg border border-[#d7e8cf] bg-[#F1F9EE] px-4 py-2.5 text-xs text-[#3f6218]">
              已执行 {result.executed.length} 笔交易
              {result.skipped.length > 0
                ? `，跳过 ${result.skipped.length} 笔（${result.skipped
                    .map((entry) => `${entry.symbol}：${entry.reason}`)
                    .join("；")}）`
                : ""}
              。持仓快照将随重放更新。
            </div>
          ) : null}

          {changed.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              当前组合无需调仓：所有权重均在画像阈值内，无活跃防御信号，且未触发止损与漂移规则。
            </p>
          ) : (
            <div className="space-y-3">
              {changed.map((target) => (
                <TargetCard
                  key={target.symbol}
                  target={target}
                  scale={weightScale}
                  trade={roundedTrades.get(target.symbol) ?? null}
                />
              ))}
            </div>
          )}

          {plan.plan.trades.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {plan.plan.trades.map((trade) => (
                  <span
                    key={`${trade.symbol}-${trade.side}`}
                    className="border-border inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums"
                  >
                    <span
                      className={cn(
                        "font-medium",
                        trade.side === "sell" ? "text-[#3f6218]" : "text-[#b91c1c]",
                      )}
                    >
                      {trade.side === "sell" ? "卖出" : "买入"}
                    </span>
                    {trade.symbol} {trade.quantity} 股 @ {trade.price.toFixed(2)} ≈ ¥
                    {trade.estimated_value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                    {trade.estimated_tax ? (
                      <span className="text-muted-foreground">
                        （印花税 ¥
                        {trade.estimated_tax.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}）
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                <span>
                  合计换手 ¥
                  {tradeTotals.turnover.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
                <span>
                  估算费用（0.05%）¥
                  {tradeTotals.fee.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
                <span>
                  A 股印花税（0.05%）¥
                  {tradeTotals.tax.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </span>
                <span className="ml-auto">
                  现金 {plan.plan.cash_before_pct.toFixed(1)}% →{" "}
                  {plan.plan.cash_after_pct.toFixed(1)}%
                </span>
              </div>
            </div>
          ) : null}

          {comparison && comparison.series.length >= 2 ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 bg-[#8d867c]" />
                  不调仓（按现权重持有） {comparison.baseline_return_pct != null ? `${comparison.baseline_return_pct.toFixed(2)}%` : ""}
                </span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 bg-[#3f6218]" />
                  按方案调仓 {comparison.proposed_return_pct != null ? `${comparison.proposed_return_pct.toFixed(2)}%` : ""}
                </span>
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {comparison.start_date} ~ {comparison.end_date} · 历史投影，不代表未来
                </span>
              </div>
              <ComparisonChart series={comparison.series} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TargetCard({
  target,
  scale,
  trade,
}: {
  target: RebalanceTarget;
  scale: number;
  trade: RebalanceTrade | null;
}) {
  const delta = target.target_weight_pct - target.current_weight_pct;
  const tags = ruleTags(target);
  const counterfactual = counterfactualFor(target);

  return (
    <div className="border-border bg-card rounded-2xl border px-5 py-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-foreground text-sm font-semibold tabular-nums">{target.symbol}</span>
        {tags.map((tag) => (
          <span
            key={tag.label}
            className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tag.tone)}
          >
            {tag.label}
          </span>
        ))}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {target.current_weight_pct.toFixed(1)}% →{" "}
          <span className="text-foreground font-medium">
            {target.target_weight_pct.toFixed(1)}%
          </span>
          <span className={cn("ml-1.5", delta < 0 ? "text-[#3f6218]" : "text-[#b91c1c]")}>
            ({delta > 0 ? "+" : ""}
            {delta.toFixed(1)}pp)
          </span>
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <WeightBar
          label="当前"
          value={target.current_weight_pct}
          scale={scale}
          barClass="bg-[#8d867c]"
        />
        <WeightBar
          label="目标"
          value={target.target_weight_pct}
          scale={scale}
          barClass="bg-[#3f6218]"
        />
      </div>

      {target.reasons.length > 0 ? (
        <ul className="mt-3 space-y-0.5">
          {target.reasons.map((reason) => (
            <li key={reason} className="text-foreground/70 text-xs leading-5">
              · {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {trade ? (
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          受整手规则限制，按最小一手成交，实际成交后权重约{" "}
          <span className="text-foreground font-medium tabular-nums">
            {trade.post_weight_pct?.toFixed(1)}%
          </span>
          （目标 {target.target_weight_pct.toFixed(1)}%）
        </p>
      ) : null}

      {counterfactual ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#f0d9a8] bg-[#FDF6E7] px-3.5 py-2.5">
          <span className="mt-0.5 shrink-0 rounded bg-[#8a5a00]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#8a5a00]">
            如果不调整
          </span>
          <p className="text-xs leading-5 text-[#6e4a05]">{counterfactual}</p>
        </div>
      ) : null}
    </div>
  );
}

function WeightBar({
  label,
  value,
  scale,
  barClass,
}: {
  label: string;
  value: number;
  scale: number;
  barClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-6 shrink-0 text-[10px]">{label}</span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", barClass)}
          style={{ width: `${Math.min(100, (value / scale) * 100)}%` }}
        />
      </div>
      <span className="text-muted-foreground w-11 shrink-0 text-right text-[11px] tabular-nums">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

/** Deterministic rule badges derived from the plan's reason strings. */
function ruleTags(target: RebalanceTarget): { label: string; tone: string }[] {
  const reasons = target.reasons.join("；");
  const tags: { label: string; tone: string }[] = [];
  if (target.signal) {
    tags.push({
      label: `决策信号 · ${target.signal.action === "sell" ? "卖出" : "减持"}`,
      tone: "bg-[#FDF6E7] text-[#8a5a00]",
    });
  }
  if (reasons.includes("止损线")) {
    tags.push({ label: "触发止损", tone: "bg-[#FFF2F2] text-[#b91c1c]" });
  }
  if (reasons.includes("回归基线")) {
    tags.push({ label: "权重漂移", tone: "bg-[#E6F1FB] text-[#185FA5]" });
  }
  if (reasons.includes("单一持仓上限")) {
    tags.push({ label: "超单一上限", tone: "bg-muted text-foreground/70" });
  }
  if (reasons.includes("现金底仓")) {
    tags.push({ label: "现金底仓", tone: "bg-muted text-foreground/70" });
  }
  return tags;
}

/** Deterministic counterfactual: what stays exposed if nothing changes. */
function counterfactualFor(target: RebalanceTarget): string | null {
  const reasons = target.reasons.join("；");
  if (target.signal?.action === "sell") {
    return `决策信号建议清仓，未处理将维持 ${target.current_weight_pct.toFixed(1)}% 仓位继续暴露`;
  }
  if (reasons.includes("止损线") && target.unrealized_pnl_pct != null) {
    return `浮亏将维持在 ${target.unrealized_pnl_pct.toFixed(1)}%，持续暴露于止损线之下的下行风险`;
  }
  if (reasons.includes("回归基线") && target.baseline_weight_pct != null) {
    return `权重将持续高于 30 天前基线 ${target.baseline_weight_pct.toFixed(1)}%，超配敞口维持不变`;
  }
  if (reasons.includes("单一持仓上限")) {
    return `权重将保持 ${target.current_weight_pct.toFixed(1)}%，持续超出单一持仓上限`;
  }
  if (reasons.includes("现金底仓")) {
    return "现金占比将持续低于底仓要求，组合流动性缓冲不足";
  }
  return null;
}

const W = 720;
const H = 180;
const PAD = 8;

function ComparisonChart({
  series,
}: {
  series: { date: string; baseline_equity: number; proposed_equity?: number | null }[];
}) {
  const paths = useMemo(() => {
    const values = series.flatMap((point) => [
      point.baseline_equity,
      point.proposed_equity ?? point.baseline_equity,
    ]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const xAt = (index: number) => (index / Math.max(1, series.length - 1)) * W;
    const yAt = (value: number) => H - PAD - ((value - min) / span) * (H - PAD * 2);
    let baseline = "";
    let proposed = "";
    series.forEach((point, index) => {
      const command = index === 0 ? "M" : "L";
      baseline += `${command}${xAt(index).toFixed(1)} ${yAt(point.baseline_equity).toFixed(1)} `;
      proposed += `${command}${xAt(index).toFixed(1)} ${yAt(
        point.proposed_equity ?? point.baseline_equity,
      ).toFixed(1)} `;
    });
    return { baseline, proposed };
  }, [series]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={paths.baseline} fill="none" stroke="#8d867c" strokeWidth="2" strokeDasharray="5 4" />
      <path d={paths.proposed} fill="none" stroke="#3f6218" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
