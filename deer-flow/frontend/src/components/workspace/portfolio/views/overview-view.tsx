"use client";

import { ArrowRightIcon } from "lucide-react";
import { useMemo } from "react";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { useDailyPnlSeries, type DailyPnlPoint } from "@/core/portfolio/daily-pnl";
import { cn } from "@/lib/utils";

function num(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function OverviewView({
  item: _item,
  portfolios,
  onSelectPortfolio,
}: {
  item: PortfolioDashboardItem;
  portfolios: PortfolioDashboardItem[];
  onSelectPortfolio?: (id: string) => void;
}) {
  const { locale } = useI18n();
  const { data: pnlData, isLoading } = useDailyPnlSeries(120);

  const totals = useMemo(() => {
    let equity = 0;
    let cash = 0;
    let pnl = 0;
    let currency = "CNY";
    let positionCount = 0;
    for (const entry of portfolios) {
      equity += num(entry.latestSnapshot?.totalEquity) ?? 0;
      cash += num(entry.latestSnapshot?.cashValue) ?? 0;
      pnl += num(entry.performance?.unrealizedPnl) ?? 0;
      positionCount += entry.positions.length;
      if (entry.latestSnapshot?.baseCurrency) currency = entry.latestSnapshot.baseCurrency;
    }
    return { equity, cash, pnl, currency, positionCount };
  }, [portfolios]);

  return (
    <div className="w-full space-y-6">
      {/* headline */}
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="px-6 pt-6 pb-2">
          <div className="text-muted-foreground text-[11px] font-bold tracking-[0.18em] uppercase">
            总资产
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="font-serif text-5xl font-normal tracking-[-0.02em] tabular-nums">
              {formatPortfolioAmount(String(totals.equity), totals.currency, locale)}
            </div>
            <div
              className={cn(
                "pb-1.5 text-sm font-medium tabular-nums",
                totals.pnl >= 0 ? "text-[#b91c1c]" : "text-[#3f6218]",
              )}
            >
              {totals.pnl >= 0 ? "+" : ""}
              {formatPortfolioAmount(String(totals.pnl), totals.currency, locale)} 浮动盈亏
            </div>
          </div>
        </div>
        <div className="border-border mt-4 grid grid-cols-3 gap-[1px] border-t bg-[#e8e5e0]">
          <SummaryCell label="现金" value={formatPortfolioAmount(String(totals.cash), totals.currency, locale)} />
          <SummaryCell label="持仓标的" value={`${totals.positionCount} 只`} />
          <SummaryCell label="组合数" value={`${portfolios.length} 个`} />
        </div>
      </section>

      {/* PnL calendar */}
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-sm font-semibold">每日盈亏</h2>
          <span className="text-muted-foreground text-xs">
            近 120 天 · 红涨绿跌 · 已扣除出入金
          </span>
        </div>
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="bg-muted h-32 animate-pulse rounded-xl" />
          ) : pnlData && pnlData.series.length > 0 ? (
            <PnlCalendar points={pnlData.series} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              暂无足够的历史数据生成盈亏日历
            </p>
          )}
        </div>
      </section>

      {/* portfolio list */}
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="border-border border-b px-6 py-4">
          <h2 className="text-foreground text-sm font-semibold">我的组合</h2>
        </div>
        <div className="divide-border divide-y">
          {portfolios.map((entry) => {
            const equity = num(entry.latestSnapshot?.totalEquity);
            const pnl = num(entry.performance?.unrealizedPnl);
            const pnlPct = num(entry.performance?.unrealizedReturn);
            const currency = entry.latestSnapshot?.baseCurrency ?? entry.portfolio.baseCurrency;
            return (
              <button
                key={entry.portfolio.id}
                onClick={() => onSelectPortfolio?.(entry.portfolio.id)}
                className="hover:bg-muted/50 flex w-full items-center gap-4 px-6 py-4 text-left transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-semibold">
                    {entry.portfolio.name}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {entry.portfolio.purpose ?? entry.portfolio.baseCurrency} ·{" "}
                    {entry.positions.length} 只持仓
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-foreground text-sm font-medium tabular-nums">
                    {equity != null ? formatPortfolioAmount(String(equity), currency, locale) : "—"}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs font-medium tabular-nums",
                      pnl != null && pnl >= 0 ? "text-[#b91c1c]" : "text-[#3f6218]",
                    )}
                  >
                    {pnl != null
                      ? `${pnl >= 0 ? "+" : ""}${formatPortfolioAmount(String(pnl), currency, locale)}`
                      : "—"}
                    {pnlPct != null ? ` (${pnlPct >= 0 ? "+" : ""}${(pnlPct * 100).toFixed(2)}%)` : ""}
                  </div>
                </div>
                <ArrowRightIcon className="text-foreground/30 size-4 shrink-0" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-6 py-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground mt-1 text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

const CELL = 14;
const GAP = 3;

function PnlCalendar({ points }: { points: DailyPnlPoint[] }) {
  const { weeks, months } = useMemo(() => {
    const byDate = new Map(points.map((point) => [point.date, point]));
    const first = new Date(`${points[0]!.date}T00:00:00`);
    const last = new Date(`${points[points.length - 1]!.date}T00:00:00`);
    // Align to the Monday of the first week.
    const start = new Date(first);
    const day = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - day);

    const weeks: (DailyPnlPoint | null)[][] = [];
    const months: { label: string; weekIndex: number }[] = [];
    const cursor = new Date(start);
    let lastMonth = -1;
    while (cursor <= last) {
      const week: (DailyPnlPoint | null)[] = [];
      const weekIndex = weeks.length;
      for (let d = 0; d < 7; d++) {
        const key = cursor.toISOString().slice(0, 10);
        week.push(byDate.get(key) ?? null);
        const month = cursor.getMonth();
        if (month !== lastMonth && cursor.getDate() <= 7) {
          months.push({
            label: `${month + 1}月`,
            weekIndex,
          });
          lastMonth = month;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, months };
  }, [points]);

  const maxAbs = useMemo(() => {
    let max = 0;
    for (const point of points) {
      const abs = Math.abs(point.pnl);
      if (abs > max) max = abs;
    }
    return max || 1;
  }, [points]);

  return (
    <div>
      <div className="relative mb-1" style={{ height: 16 }}>
        {months.map((month) => (
          <span
            key={`${month.label}-${month.weekIndex}`}
            className="text-muted-foreground absolute text-[10px]"
            style={{ left: month.weekIndex * (CELL + GAP) }}
          >
            {month.label}
          </span>
        ))}
      </div>
      <div className="flex" style={{ gap: GAP }}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col" style={{ gap: GAP }}>
            {week.map((point, dayIndex) => (
              <div
                key={dayIndex}
                title={
                  point
                    ? `${point.date} · ${point.pnl >= 0 ? "+" : ""}¥${Math.abs(point.pnl).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}${point.pnl_pct != null ? ` (${point.pnl_pct >= 0 ? "+" : ""}${point.pnl_pct.toFixed(2)}%)` : ""}`
                    : undefined
                }
                className="rounded-[3px]"
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: point ? pnlColor(point.pnl, maxAbs) : "transparent",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-3 flex items-center gap-2 text-[10px]">
        <span>亏</span>
        <div className="flex" style={{ gap: 2 }}>
          {[-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((t) => (
            <div
              key={t}
              className="rounded-[2px]"
              style={{ width: 10, height: 10, backgroundColor: pnlColor(t, 1) }}
            />
          ))}
        </div>
        <span>赚</span>
      </div>
    </div>
  );
}

function pnlColor(pnl: number, maxAbs: number): string {
  if (Math.abs(pnl) < 0.005) return "#f0ede8"; // flat day
  const intensity = Math.min(1, Math.abs(pnl) / maxAbs);
  // A-share convention: red = gain, green = loss.
  if (pnl > 0) {
    return `rgba(185, 28, 28, ${0.18 + intensity * 0.72})`;
  }
  return `rgba(63, 98, 24, ${0.18 + intensity * 0.72})`;
}
