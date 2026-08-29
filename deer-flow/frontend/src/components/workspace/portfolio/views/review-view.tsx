"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { getStockSymbolNames } from "@/core/portfolio";
import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import type { InsightComputedPayload } from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { InsightRunner } from "../evidence/insight-runner";

const PERIODS = [
  { key: "7", label: "近 7 天" },
  { key: "30", label: "近 30 天" },
  { key: "90", label: "近 90 天" },
  { key: "ytd", label: "今年以来" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodDates(period: PeriodKey): { start: string; end: string } {
  const today = new Date();
  const end = toISODate(today);
  if (period === "ytd") {
    return { start: `${today.getFullYear()}-01-01`, end };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - Number(period));
  return { start: toISODate(start), end };
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${Math.abs(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function ReviewView({ item }: { item: PortfolioDashboardItem }) {
  const accountId = Number(item.portfolio.id);
  const [period, setPeriod] = useState<PeriodKey>("30");
  const dates = useMemo(() => periodDates(period), [period]);
  const autoRunKey = `${accountId}|${dates.start}|${dates.end}`;

  return (
    <InsightRunner
      packType="review"
      accountId={Number.isFinite(accountId) ? accountId : null}
      title="复盘报告"
      description="基于交易流水与缓存收盘价的确定性归因：持仓市值变动 + 期间交易净流，对账校验后交由 AI 解读，每个数字可溯源。"
      buildBody={() => ({
        account_id: accountId,
        start_date: dates.start,
        end_date: dates.end,
      })}
      autoRunKey={autoRunKey}
      persistedValidator={(report) => {
        const review = report.data as unknown as {
          period_start?: string;
          period_end?: string;
        };
        return review.period_start === dates.start && review.period_end === dates.end;
      }}
      headline={(data) => {
        const review = data as unknown as {
          period_return_pct: number | null;
          equity_start: number | null;
          equity_end: number | null;
          net_cash_flow: number;
          attribution: { symbol: string; contribution: number }[];
        };
        if (review.equity_start == null || review.equity_end == null) return null;
        const best = [...review.attribution].sort((a, b) => b.contribution - a.contribution)[0];
        const worst = [...review.attribution].sort((a, b) => a.contribution - b.contribution)[0];
        const change = review.equity_end - review.equity_start - review.net_cash_flow;
        const direction = change >= 0 ? "增值" : "缩水";
        const parts = [`本期间组合${direction} ${formatMoney(Math.abs(change))}`];
        if (review.period_return_pct != null) {
          parts.push(`收益率 ${formatPct(review.period_return_pct)}`);
        }
        if (best && best.contribution > 0) {
          parts.push(`${best.symbol} 贡献最大（+${formatMoney(best.contribution)}）`);
        }
        if (worst && worst.contribution < 0) {
          parts.push(`${worst.symbol} 拖累最大（${formatMoney(worst.contribution)}）`);
        }
        return parts.join("，") + "。";
      }}
      controls={
        <div className="border-border bg-card flex items-center gap-1 rounded-lg border p-1">
          {PERIODS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setPeriod(entry.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === entry.key
                  ? "bg-foreground text-background"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      }
      renderStructured={(data, pack) => (
        <ReviewStructured data={data} pack={pack} />
      )}
    />
  );
}

function ReviewStructured({
  data,
  pack,
}: {
  data: InsightComputedPayload["data"];
  pack: EvidencePack;
}) {
  const review = data as unknown as {
    period_return_pct: number | null;
    equity_start: number | null;
    equity_end: number | null;
    net_cash_flow: number;
    cash_flows: { event_date: string; direction: string; amount: number }[];
    attribution: {
      symbol: string;
      name: string;
      weight_start_pct: number | null;
      weight_end_pct: number | null;
      holding_contribution: number;
      trade_contribution: number;
      contribution: number;
      fact_id?: string | null;
    }[];
    trades: {
      trade_date: string;
      symbol: string;
      side: string;
      quantity: number;
      price: number;
      fee: number;
      tax: number;
    }[];
    reconciliation: {
      parts_total: number;
      expected_total: number;
      difference: number;
      tolerance: number;
      reconciled: boolean;
    } | null;
  };

  const symbols = useMemo(
    () => [...new Set(review.attribution.map((row) => row.symbol))],
    [review.attribution],
  );
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void getStockSymbolNames(symbols).then((resolved) => {
      if (!cancelled) setNames(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const reconciliation = review.reconciliation;

  return (
    <div className="space-y-6">
      <div className="border-border bg-card grid grid-cols-2 gap-[1px] overflow-hidden rounded-2xl border md:grid-cols-4">
        <MetricCell label="期初净值" value={formatMoney(review.equity_start)} />
        <MetricCell label="期末净值" value={formatMoney(review.equity_end)} />
        <MetricCell
          label="期间收益率（扣除出入金）"
          value={formatPct(review.period_return_pct)}
          tone={
            review.period_return_pct != null && review.period_return_pct !== 0
              ? review.period_return_pct > 0
                ? "up"
                : "down"
              : undefined
          }
        />
        <MetricCell label="净出入金" value={formatMoney(review.net_cash_flow)} />
      </div>

      {reconciliation ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium",
            reconciliation.reconciled
              ? "border-[#d7e8cf] bg-[#F1F9EE] text-[#3f6218]"
              : "border-[#f0d9a8] bg-[#FDF6E7] text-[#8a5a00]",
          )}
        >
          {reconciliation.reconciled ? (
            <CheckCircle2Icon className="size-3.5" />
          ) : (
            <XCircleIcon className="size-3.5" />
          )}
          {reconciliation.reconciled
            ? `归因对账通过：分项合计 ${formatMoney(reconciliation.parts_total)} = 净值变动减出入金 ${formatMoney(reconciliation.expected_total)}`
            : `归因存在未解释差额 ${formatMoney(reconciliation.difference)}（容差 ${formatMoney(reconciliation.tolerance)}），已在证据缺口中说明`}
        </div>
      ) : null}

      {review.attribution.length > 0 ? (
        <ContributionChart attribution={review.attribution} names={names} />
      ) : null}

      <section className="border-border bg-card overflow-hidden rounded-2xl border">
        <div className="border-border border-b px-6 py-4">
          <h3 className="text-foreground text-sm font-semibold">逐标的收益归因</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="px-6 py-2.5 font-medium">标的</th>
                <th className="px-4 py-2.5 text-right font-medium">期初权重</th>
                <th className="px-4 py-2.5 text-right font-medium">期末权重</th>
                <th className="px-4 py-2.5 text-right font-medium">持仓贡献</th>
                <th className="px-4 py-2.5 text-right font-medium">交易贡献</th>
                <th className="px-6 py-2.5 text-right font-medium">总贡献</th>
              </tr>
            </thead>
            <tbody>
              {review.attribution.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted-foreground px-6 py-8 text-center text-xs"
                  >
                    期间无持仓或交易记录
                  </td>
                </tr>
              ) : (
                review.attribution.map((row) => (
                  <tr key={row.symbol} className="border-border/60 border-b last:border-0">
                    <td className="px-6 py-2.5">
                      <span className="font-medium">{names[row.symbol] ?? row.symbol}</span>
                      <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                        {row.symbol}
                      </span>
                      {row.fact_id ? (
                        <span className="text-muted-foreground border-border bg-muted/60 ml-2 rounded border px-1 text-[10px] tabular-nums">
                          {row.fact_id}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.weight_start_pct != null ? `${row.weight_start_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.weight_end_pct != null ? `${row.weight_end_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.holding_contribution)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(row.trade_contribution)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-2.5 text-right font-medium tabular-nums",
                        row.contribution > 0 && "text-[#b91c1c]",
                        row.contribution < 0 && "text-[#3f6218]",
                      )}
                    >
                      {formatMoney(row.contribution)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {review.trades.length > 0 || review.cash_flows.length > 0 ? (
        <EventTimeline
          trades={review.trades}
          cashFlows={review.cash_flows}
          names={names}
        />
      ) : null}

      <p className="text-muted-foreground text-xs">
        证据包 {pack.pack_id.slice(0, 8)} · 数据截至 {pack.as_of} · 价格为缓存历史收盘价（非实时）
      </p>
    </div>
  );
}

interface AttributionLite {
  symbol: string;
  name: string;
  contribution: number;
  fact_id?: string | null;
}

function ContributionChart({
  attribution,
  names,
}: {
  attribution: AttributionLite[];
  names: Record<string, string>;
}) {
  const sorted = useMemo(
    () => [...attribution].sort((a, b) => b.contribution - a.contribution),
    [attribution],
  );
  const maxAbs = Math.max(
    ...sorted.map((row) => Math.abs(row.contribution)),
    1,
  );

  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="border-border flex items-center justify-between border-b px-6 py-4">
        <h3 className="text-foreground text-sm font-semibold">贡献对比</h3>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#b91c1c]" />
            正贡献
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#3f6218]" />
            负拖累
          </span>
        </div>
      </div>
      <div className="space-y-3.5 px-6 py-5">
        {sorted.map((row) => {
          const positive = row.contribution >= 0;
          const widthPct = (Math.abs(row.contribution) / maxAbs) * 50;
          return (
            <div key={row.symbol} className="flex items-center gap-3">
              <span className="text-foreground/80 w-28 truncate text-sm font-medium">
                {names[row.symbol] ?? row.symbol}
              </span>
              <div className="relative h-4 flex-1">
                <div className="bg-border absolute left-1/2 top-0 h-full w-px" />
                <div
                  className={cn(
                    "absolute top-0 h-full rounded-sm",
                    positive ? "left-1/2 bg-[#b91c1c]/75" : "right-1/2 bg-[#3f6218]/75",
                  )}
                  style={{ width: `${Math.max(1.5, widthPct)}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-24 text-right text-sm font-medium tabular-nums",
                  row.contribution > 0 && "text-[#b91c1c]",
                  row.contribution < 0 && "text-[#3f6218]",
                )}
              >
                {formatMoney(row.contribution)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface TimelineEvent {
  key: string;
  kind: "buy" | "sell" | "in" | "out";
  date: string;
  detail: string;
  amount: number;
}

const EVENT_BADGES: Record<TimelineEvent["kind"], { label: string; className: string }> = {
  buy: { label: "买入", className: "bg-[#FFF2F2] text-[#b91c1c]" },
  sell: { label: "卖出", className: "bg-[#F1F9EE] text-[#3f6218]" },
  in: { label: "入金", className: "bg-[#EFF4FB] text-[#28437a]" },
  out: { label: "出金", className: "bg-[#FDF6E7] text-[#8a5a00]" },
};

function EventTimeline({
  trades,
  cashFlows,
  names,
}: {
  trades: {
    trade_date: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    fee: number;
    tax: number;
  }[];
  cashFlows: { event_date: string; direction: string; amount: number }[];
  names: Record<string, string>;
}) {
  const groups = useMemo(() => {
    const events: TimelineEvent[] = [
      ...trades.map((trade, position) => ({
        key: `trade-${trade.trade_date}-${trade.symbol}-${position}`,
        kind: (trade.side === "buy" ? "buy" : "sell") as TimelineEvent["kind"],
        date: trade.trade_date,
        detail: `${names[trade.symbol] ?? trade.symbol} · ${trade.quantity} 股 × ¥${trade.price.toFixed(2)} · 费用 ¥${(trade.fee + trade.tax).toFixed(2)}`,
        amount: trade.quantity * trade.price,
      })),
      ...cashFlows.map((flow, position) => ({
        key: `cash-${flow.event_date}-${position}`,
        kind: (flow.direction === "in" ? "in" : "out") as TimelineEvent["kind"],
        date: flow.event_date,
        detail: flow.direction === "in" ? "资金转入账户" : "资金转出账户",
        amount: flow.amount,
      })),
    ];
    const byDate = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const list = byDate.get(event.date) ?? [];
      list.push(event);
      byDate.set(event.date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([eventDate, list]) => ({
        date: eventDate,
        weekday: new Date(`${eventDate}T00:00:00`).toLocaleDateString("zh-CN", {
          weekday: "short",
        }),
        events: list,
      }));
  }, [trades, cashFlows, names]);

  const totalCount = trades.length + cashFlows.length;

  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="border-border flex items-center justify-between border-b px-6 py-4">
        <h3 className="text-foreground text-sm font-semibold">期间事件时间轴</h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          共 {totalCount} 项 · 按时间正序
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto px-6 py-5">
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.date} className="grid grid-cols-[112px_1fr] gap-4">
              <div className="pt-0.5 text-right">
                <div className="text-foreground text-sm font-medium tabular-nums">
                  {group.date}
                </div>
                <div className="text-muted-foreground text-xs">{group.weekday}</div>
              </div>
              <div className="border-border border-l pl-4">
                <div className="space-y-2">
                  {group.events.map((event) => {
                    const badge = EVENT_BADGES[event.kind];
                    return (
                      <div key={event.key} className="relative flex items-center gap-3">
                        <span
                          className={cn(
                            "border-background absolute -left-[21.5px] size-2.5 rounded-full border-2",
                            event.kind === "buy" && "bg-[#b91c1c]",
                            event.kind === "sell" && "bg-[#3f6218]",
                            event.kind === "in" && "bg-[#28437a]",
                            event.kind === "out" && "bg-[#8a5a00]",
                          )}
                        />
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                            badge.className,
                          )}
                        >
                          {badge.label}
                        </span>
                        <span className="text-foreground/80 min-w-0 flex-1 truncate text-sm">
                          {event.detail}
                        </span>
                        <span className="text-foreground shrink-0 text-sm font-medium tabular-nums">
                          ¥
                          {event.amount.toLocaleString("zh-CN", {
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="bg-card px-6 py-5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1.5 font-serif text-2xl font-normal tracking-[-0.02em] tabular-nums",
          tone === "up" && "text-[#b91c1c]",
          tone === "down" && "text-[#3f6218]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
