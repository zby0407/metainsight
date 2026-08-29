"use client";

import { FlaskConicalIcon, SlidersHorizontalIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { type EnrichedPosition } from "@/core/portfolio";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import type { InsightComputedPayload, ScenarioData, WhatIfData } from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { InsightRunner } from "../evidence/insight-runner";

type SandboxMode = "what_if" | "scenario";

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function SandboxView({ item }: { item: PortfolioDashboardItem }) {
  const [mode, setMode] = useState<SandboxMode>("what_if");
  const accountId = Number(item.portfolio.id);

  const equity = Number(item.latestSnapshot?.totalEquity ?? 0);
  const positions = useMemo(
    () =>
      ((item.positions ?? []) as EnrichedPosition[])
        .map((position) => {
          const marketValue = Number(position.marketValue ?? 0);
          return {
            symbol: position.symbol,
            name: position.name,
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
        <WhatIfSandbox accountId={accountId} positions={positions} />
      ) : (
        <ScenarioSandbox accountId={accountId} positions={positions} />
      )}
    </div>
  );
}

interface PositionSeed {
  symbol: string;
  name: string;
  marketValue: number;
  weightPct: number;
}

function WhatIfSandbox({
  accountId,
  positions,
}: {
  accountId: number;
  positions: PositionSeed[];
}) {
  const [deltas, setDeltas] = useState<Record<string, string>>({});

  const adjustments = useMemo(
    () =>
      Object.entries(deltas)
        .map(([symbol, raw]) => ({ symbol, delta_weight_pct: Number(raw) || 0 }))
        .filter((entry) => Number.isFinite(entry.delta_weight_pct) && entry.delta_weight_pct !== 0),
    [deltas],
  );

  return (
    <InsightRunner
      packType="sandbox"
      accountId={Number.isFinite(accountId) ? accountId : null}
      title="模拟沙盘 · 调仓 what-if"
      description="用当前真实持仓与缓存收盘价，确定性重算权重调整后的集中度与现金水平——只做算术，不做任何收益预测。"
      buildBody={() => ({
        account_id: accountId,
        sandbox: { mode: "what_if", adjustments },
      })}
      runLabel={adjustments.length > 0 ? "推演调整" : "先设置调整幅度"}
      panel={
        <section className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border flex flex-wrap items-center gap-2 border-b px-6 py-4">
            <SlidersHorizontalIcon className="text-foreground/60 size-4" />
            <h3 className="text-foreground text-sm font-semibold">参数面板 · 调整幅度</h3>
            <span className="text-muted-foreground text-xs">
              百分点（pp），正数 = 加仓、负数 = 减仓，现金自动吸收差额
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((position) => (
              <label key={position.symbol} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate font-medium">
                  {position.name || position.symbol}
                  <span className="text-muted-foreground ml-1 tabular-nums">
                    {position.weightPct.toFixed(1)}%
                  </span>
                </span>
                <input
                  type="number"
                  step="1"
                  placeholder="0"
                  value={deltas[position.symbol] ?? ""}
                  onChange={(event) =>
                    setDeltas((current) => ({
                      ...current,
                      [position.symbol]: event.target.value,
                    }))
                  }
                  className="border-border focus-visible:ring-foreground/20 w-20 rounded-md border bg-transparent px-2 py-1 text-right text-xs tabular-nums outline-none focus-visible:ring-2"
                />
                <span className="text-muted-foreground">pp</span>
              </label>
            ))}
          </div>
        </section>
      }
      renderStructured={(data, pack) => <WhatIfStructured data={data} pack={pack} />}
    />
  );
}

function WhatIfStructured({
  data,
  pack,
}: {
  data: InsightComputedPayload["data"];
  pack: EvidencePack;
}) {
  const whatIf = data as unknown as WhatIfData;
  const triggered = pack.rules.filter((rule) => rule.triggered);
  const appliedDeltas = whatIf.positions
    .map((row) => ({ symbol: row.symbol, delta: row.weight_after_pct - row.weight_before_pct }))
    .filter((entry) => Math.abs(entry.delta) > 0.005);

  return (
    <div className="space-y-6">
      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-2xl border px-6 py-3.5">
        <span className="text-muted-foreground text-xs font-medium">本次推演输入</span>
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
              return (
                <tr key={row.symbol} className="border-border/60 border-b last:border-0">
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
      <div className="mt-1.5 font-serif text-2xl tabular-nums">
        {after != null ? `${after.toFixed(1)}%` : "—"}
      </div>
      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
        调整前 {before != null ? `${before.toFixed(1)}%` : "—"}
        {delta != null && delta !== 0 ? `（${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp）` : ""}
      </p>
    </div>
  );
}

function ScenarioSandbox({
  accountId,
  positions,
}: {
  accountId: number;
  positions: PositionSeed[];
}) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 60);
  const [startDate, setStartDate] = useState(toISODate(defaultStart));
  const [endDate, setEndDate] = useState(toISODate(today));
  const [weights, setWeights] = useState<Record<string, string>>({});

  const proposedWeights = useMemo(() => {
    const result: Record<string, number> = {};
    for (const position of positions) {
      const raw = weights[position.symbol];
      const value = raw != null && raw !== "" ? Number(raw) : position.weightPct;
      if (Number.isFinite(value) && value >= 0) {
        result[position.symbol] = Math.min(100, value) / 100;
      }
    }
    return result;
  }, [positions, weights]);

  return (
    <InsightRunner
      packType="sandbox"
      accountId={Number.isFinite(accountId) ? accountId : null}
      title="模拟沙盘 · 历史情景回放"
      description="把拟定权重放回真实历史行情中做确定性投影：组合日收益 = Σ 权重 × 个股真实日收益。不预测未来，不含费用与滑点。"
      buildBody={() => ({
        account_id: accountId,
        sandbox: {
          mode: "scenario",
          start_date: startDate,
          end_date: endDate,
          proposed_weights: proposedWeights,
        },
      })}
      runLabel="开始回放"
      panel={
        <section className="border-border bg-card overflow-hidden rounded-2xl border">
          <div className="border-border flex flex-wrap items-center gap-2 border-b px-6 py-4">
            <FlaskConicalIcon className="text-foreground/60 size-4" />
            <h3 className="text-foreground text-sm font-semibold">参数面板 · 回放设定</h3>
            <span className="text-muted-foreground text-xs">
              未填写权重的持仓按比例分配剩余额度
            </span>
          </div>
          <div className="px-6 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
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
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {positions.map((position) => (
                <label key={position.symbol} className="flex items-center gap-2 text-xs">
                  <span className="w-32 truncate font-medium">
                    {position.name || position.symbol}
                    <span className="text-muted-foreground ml-1 tabular-nums">
                      现 {position.weightPct.toFixed(1)}%
                    </span>
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder={position.weightPct.toFixed(0)}
                    value={weights[position.symbol] ?? ""}
                    onChange={(event) =>
                      setWeights((current) => ({
                        ...current,
                        [position.symbol]: event.target.value,
                      }))
                    }
                    className="border-border focus-visible:ring-foreground/20 w-20 rounded-md border bg-transparent px-2 py-1 text-right text-xs tabular-nums outline-none focus-visible:ring-2"
                  />
                  <span className="text-muted-foreground">%</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      }
      renderStructured={(data, pack) => <ScenarioStructured data={data} pack={pack} />}
    />
  );
}

function ScenarioStructured({
  data,
  pack,
}: {
  data: InsightComputedPayload["data"];
  pack: EvidencePack;
}) {
  const scenario = data as unknown as ScenarioData;
  const chartPoints = scenario.series.filter(
    (point) => point.proposed_equity != null,
  );

  return (
    <div className="space-y-6">
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
            <span
              key={symbol}
              className="border-border bg-muted/60 rounded-md border px-2 py-1 text-xs tabular-nums"
            >
              {symbol} {(weight * 100).toFixed(1)}%
            </span>
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

function ScenarioChart({
  points,
}: {
  points: { date: string; baseline_equity: number; proposed_equity?: number | null }[];
}) {
  const paths = useMemo(() => {
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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={paths.baseline} fill="none" stroke="#8d867c" strokeWidth="2" strokeDasharray="5 4" />
      <path d={paths.proposed} fill="none" stroke="#3f6218" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
