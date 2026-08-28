"use client";

import { useMemo, useState } from "react";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { useStockEquitySeries } from "@/core/portfolio";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "7天", days: 7 },
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
] as const;

function num(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const W = 720;
const H = 200;
const PAD = 10;

function EquityChart({ points }: { points: { date: string; equity: number }[] }) {
  const { line, area, lastY, rising } = useMemo(() => {
    if (points.length < 2) {
      return { line: "", area: "", lastY: 0, rising: true };
    }
    const values = points.map((p) => p.equity);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = points.map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - PAD - ((p.equity - min) / span) * (H - PAD * 2);
      return [x, y] as const;
    });
    let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    const rising = values[values.length - 1]! >= values[0]!;
    return { line: d, area: `${d} L${W} ${H} L0 ${H} Z`, lastY: pts[pts.length - 1]![1], rising };
  }, [points]);

  if (points.length < 2) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        历史数据不足，无法绘制净值走势
      </div>
    );
  }

  const stroke = rising ? "#3f6218" : "#b91c1c";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={stroke} stopOpacity="0.16" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#eq-fill)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={W} cy={lastY} r="4" fill={stroke} />
    </svg>
  );
}

export function EarningsView({ item }: { item: PortfolioDashboardItem }) {
  const { locale } = useI18n();
  const [days, setDays] = useState<number>(30);
  const { data: series, isLoading } = useStockEquitySeries(days);

  const currency = item.latestSnapshot?.baseCurrency ?? item.portfolio.baseCurrency;
  const equity = num(item.latestSnapshot?.totalEquity) ?? 0;
  const unrealizedPnl = num(item.performance?.unrealizedPnl);
  const unrealizedReturn = num(item.performance?.unrealizedReturn);

  const change = useMemo(() => {
    if (!series || series.length < 2) return null;
    const first = series[0]!.equity;
    const last = series[series.length - 1]!.equity;
    const diff = last - first;
    const pct = first > 0 ? (diff / first) * 100 : 0;
    return { diff, pct };
  }, [series]);

  const rising = (change?.diff ?? 0) >= 0;

  return (
    <div className="w-full space-y-6">
      {/* metrics strip */}
      <div className="border-border bg-card grid grid-cols-3 gap-[1px] overflow-hidden rounded-2xl border">
        <MetricCell
          label="当前净资产"
          value={formatPortfolioAmount(String(equity), currency, locale)}
        />
        <MetricCell
          label="累计盈亏"
          value={
            unrealizedPnl != null
              ? `${unrealizedPnl > 0 ? "+" : ""}${formatPortfolioAmount(String(unrealizedPnl), currency, locale)}`
              : "—"
          }
          tone={unrealizedPnl != null && unrealizedPnl !== 0 ? (unrealizedPnl > 0 ? "up" : "down") : undefined}
        />
        <MetricCell
          label="累计收益率"
          value={
            unrealizedReturn != null
              ? `${unrealizedReturn > 0 ? "+" : ""}${(unrealizedReturn * 100).toFixed(2)}%`
              : "—"
          }
          tone={unrealizedReturn != null && unrealizedReturn !== 0 ? (unrealizedReturn > 0 ? "up" : "down") : undefined}
        />
      </div>

      {/* equity curve */}
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="border-border flex items-center gap-2 border-b px-6 py-4">
          <h2 className="text-foreground text-sm font-semibold">净值走势</h2>
          {change ? (
            <span className={cn("text-sm font-medium tabular-nums", rising ? "text-[#b91c1c]" : "text-[#3f6218]")}>
              {change.diff > 0 ? "+" : ""}
              {formatPortfolioAmount(String(change.diff), currency, locale)} (
              {change.pct > 0 ? "+" : ""}
              {change.pct.toFixed(2)}%)
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  days === r.days
                    ? "bg-foreground text-background"
                    : "text-foreground/60 hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 py-4">
          {isLoading ? (
            <div className="bg-muted h-48 animate-pulse rounded-xl" />
          ) : (
            <EquityChart points={series ?? []} />
          )}
        </div>
        <div className="border-border text-muted-foreground flex items-center justify-between border-t px-6 py-3 text-xs">
          <span>{series?.[0]?.date ?? ""}</span>
          <span>{series?.[series.length - 1]?.date ?? ""}</span>
        </div>
      </section>
    </div>
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
