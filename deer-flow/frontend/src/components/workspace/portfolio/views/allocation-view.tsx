"use client";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { type EnrichedPosition } from "@/core/portfolio";

function num(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const MARKET_LABELS: Record<string, string> = {
  cn: "A股",
  hk: "港股",
  us: "美股",
  jp: "日股",
  kr: "韩股",
  tw: "台股",
};

const COLORS = [
  "#3f6218",
  "#65a30d",
  "#a3e635",
  "#166534",
  "#854d0e",
  "#b45309",
  "#0f766e",
  "#1d4ed8",
];

export function AllocationView({ item }: { item: PortfolioDashboardItem }) {
  const { locale } = useI18n();
  const currency = item.latestSnapshot?.baseCurrency ?? item.portfolio.baseCurrency;
  const equity = num(item.latestSnapshot?.totalEquity) ?? 0;
  const marketValue = num(item.latestSnapshot?.holdingsValue) ?? 0;
  const cash = num(item.latestSnapshot?.cashValue) ?? 0;

  const stockPct = equity > 0 ? (marketValue / equity) * 100 : 0;
  const cashPct = equity > 0 ? (cash / equity) * 100 : 0;

  // per-position weights (by market value)
  const positions = (item.positions as EnrichedPosition[])
    .map((p) => {
      const mv = num(p.marketValue) ?? 0;
      const weight = marketValue > 0 ? (mv / marketValue) * 100 : 0;
      return { p, mv, weight };
    })
    .sort((a, b) => b.weight - a.weight);

  // market distribution
  const byMarket = new Map<string, number>();
  for (const { p, mv } of positions) {
    byMarket.set(p.market, (byMarket.get(p.market) ?? 0) + mv);
  }
  const marketRows = [...byMarket.entries()]
    .map(([market, mv]) => ({
      market,
      label: MARKET_LABELS[market] ?? market,
      mv,
      weight: marketValue > 0 ? (mv / marketValue) * 100 : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  return (
    <div className="w-full space-y-6">
      {/* stock vs cash */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <h2 className="text-foreground text-sm font-semibold">资产构成</h2>
        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
          <div className="bg-[#3f6218]" style={{ width: `${stockPct}%` }} />
          <div className="bg-[#d6d3cd]" style={{ width: `${cashPct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <LegendDot color="#3f6218" label="股票" value={`${stockPct.toFixed(1)}%`} sub={formatPortfolioAmount(String(marketValue), currency, locale)} />
          <LegendDot color="#d6d3cd" label="现金" value={`${cashPct.toFixed(1)}%`} sub={formatPortfolioAmount(String(cash), currency, locale)} />
        </div>
      </section>

      {/* position weights */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <h2 className="text-foreground text-sm font-semibold">持仓权重</h2>
        <div className="mt-4 space-y-4">
          {positions.map(({ p, mv, weight }, i) => (
            <div key={p.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">{p.name || p.symbol}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatPortfolioAmount(String(mv), p.currency, locale)} · {weight.toFixed(1)}%
                </span>
              </div>
              <div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${weight}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* market distribution */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <h2 className="text-foreground text-sm font-semibold">市场分布</h2>
        <div className="mt-4 space-y-3">
          {marketRows.map((row, i) => (
            <div key={row.market} className="flex items-center gap-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-foreground/80 w-16 text-sm">{row.label}</span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${row.weight}%`, backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
              <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
                {row.weight.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LegendDot({
  color,
  label,
  value,
  sub,
}: {
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      <div>
        <div className="text-foreground text-sm font-medium">
          {label} <span className="text-muted-foreground">· {value}</span>
        </div>
        <div className="text-muted-foreground text-xs tabular-nums">{sub}</div>
      </div>
    </div>
  );
}
