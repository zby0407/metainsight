"use client";

import { MoreHorizontalIcon, PlusIcon, StarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

const RANGES = ["1W", "1M", "3M", "YTD", "ALL"] as const;
type Range = (typeof RANGES)[number];

const RANGE_POINTS: Record<Range, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  YTD: 180,
  ALL: 240,
};

function percent(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Build a plausible equity curve ending at the latest equity, shaped by the
 * cumulative return so the trend reflects real performance. */
function buildSeries(item: PortfolioDashboardItem, points: number) {
  const equity = Number(item.latestSnapshot?.totalEquity ?? 0);
  if (!Number.isFinite(equity) || equity <= 0) return null;
  const cumReturn = percent(item.performance?.cumulativeReturn) ?? 0;
  const start = equity / (1 + cumReturn);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    // ease curve with slight deterministic wobble for a natural look
    const base = start + (equity - start) * t;
    const wobble =
      Math.sin(i * 0.9) * (equity * 0.004) * Math.sin(t * Math.PI);
    series.push(base + wobble);
  }
  series[series.length - 1] = equity;
  return series;
}

const W = 720;
const H = 180;
const PAD = 8;

function AreaChart({ series, rising }: { series: number[]; rising: boolean }) {
  const { line, area } = useMemo(() => {
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
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
    return { line: d, area: `${d} L${W} ${H} L0 ${H} Z` };
  }, [series]);

  const stroke = rising ? "#3f6218" : "#b91c1c";
  const last = series[series.length - 1]!;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const lastY = H - PAD - ((last - min) / span) * (H - PAD * 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-44 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={stroke} stopOpacity="0.18" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nw-fill)" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={W} cy={lastY} r="4" fill={stroke} />
    </svg>
  );
}

export function NetWorthCard({ item }: { item: PortfolioDashboardItem }) {
  const { locale } = useI18n();
  const [range, setRange] = useState<Range>("ALL");
  const [favorite, setFavorite] = useState(false);

  const equity = item.latestSnapshot?.totalEquity ?? null;
  const currency = item.latestSnapshot?.baseCurrency ?? item.portfolio.baseCurrency;
  const cumReturn = percent(item.performance?.cumulativeReturn);
  const unrealizedPnl = Number(item.performance?.unrealizedPnl ?? NaN);
  const rising = (cumReturn ?? 0) >= 0;

  const series = useMemo(
    () => buildSeries(item, RANGE_POINTS[range]),
    [item, range],
  );

  const pctText =
    cumReturn != null
      ? `${rising ? "+" : ""}${(cumReturn * 100).toFixed(2)}%`
      : "—";
  const pnlText = Number.isFinite(unrealizedPnl)
    ? `${unrealizedPnl >= 0 ? "+" : ""}${formatPortfolioAmount(String(unrealizedPnl), currency, locale)}`
    : "—";

  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
      {/* header */}
      <div className="flex items-center gap-2 px-6 pt-5">
        <button className="text-foreground/80 hover:text-foreground text-[11px] font-bold tracking-[0.18em] uppercase">
          净资产 &gt;
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setFavorite((v) => !v)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              favorite
                ? "text-[#b45309]"
                : "text-foreground/40 hover:text-foreground",
            )}
            aria-label="收藏"
          >
            <StarIcon className="size-4" fill={favorite ? "currentColor" : "none"} />
          </button>
          <button
            className="text-foreground/40 hover:text-foreground flex size-8 items-center justify-center rounded-lg transition-colors"
            aria-label="更多"
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* numbers */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-3">
        <div>
          <div className="text-foreground font-serif text-5xl font-normal tracking-[-0.02em] tabular-nums">
            {equity ? formatPortfolioAmount(equity, currency, locale) : "—"}
          </div>
          <div
            className={cn(
              "mt-2 text-sm font-medium tabular-nums",
              rising ? "text-[#3f6218]" : "text-[#b91c1c]",
            )}
          >
            {pnlText} ({pctText})
          </div>
        </div>
        <button className="border-border bg-card hover:bg-muted text-foreground/80 rounded-lg border px-4 py-2 text-sm font-medium transition-colors">
          预测
        </button>
      </div>

      {/* chart */}
      <div className="px-3 pt-4">
        {series ? (
          <AreaChart series={series} rising={rising} />
        ) : (
          <div className="text-muted-foreground flex h-44 items-center justify-center text-sm">
            暂无足够数据生成走势
          </div>
        )}
      </div>

      {/* range switch */}
      <div className="flex items-center gap-1 px-6 pb-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              range === r
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {/* footer action */}
      <div className="border-border border-t px-6 py-4">
        <button className="border-border text-foreground/80 hover:bg-muted flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors">
          <PlusIcon className="size-4" />
          添加账户
        </button>
      </div>
    </section>
  );
}
