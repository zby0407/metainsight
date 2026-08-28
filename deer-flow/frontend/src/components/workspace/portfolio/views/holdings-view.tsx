"use client";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { type EnrichedPosition } from "@/core/portfolio";
import { cn } from "@/lib/utils";

function num(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pnlTone(value: number | null) {
  if (value == null || value === 0) return "text-foreground";
  return value > 0 ? "text-[#b91c1c]" : "text-[#3f6218]"; // A股红涨绿跌
}

function signedPct(value: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function HoldingsView({ item }: { item: PortfolioDashboardItem }) {
  const { locale } = useI18n();
  const currency = item.latestSnapshot?.baseCurrency ?? item.portfolio.baseCurrency;
  const equity = num(item.latestSnapshot?.totalEquity) ?? 0;
  const marketValue = num(item.latestSnapshot?.holdingsValue) ?? 0;
  const cash = num(item.latestSnapshot?.cashValue) ?? 0;

  const rows = (item.positions as EnrichedPosition[]).map((p) => {
    const qty = num(p.quantity) ?? 0;
    const cost = num(p.averageCost) ?? 0;
    const lastPrice = num(p.lastPrice);
    const mv = num(p.marketValue);
    const pnl = num(p.unrealizedPnl);
    const pnlPct = p.unrealizedPnlPct ?? null;
    const weight = marketValue > 0 && mv != null ? (mv / marketValue) * 100 : 0;
    return { p, qty, cost, lastPrice, mv, pnl, pnlPct, weight };
  });

  return (
    <div className="w-full space-y-6">
      {/* summary strip */}
      <div className="border-border bg-card grid grid-cols-3 gap-[1px] overflow-hidden rounded-2xl border">
        <SummaryCell label="总市值" value={formatPortfolioAmount(String(marketValue), currency, locale)} />
        <SummaryCell label="现金" value={formatPortfolioAmount(String(cash), currency, locale)} />
        <SummaryCell label="净资产" value={formatPortfolioAmount(String(equity), currency, locale)} strong />
      </div>

      {/* holdings table */}
      <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="border-border flex items-center gap-2 border-b px-6 py-4">
          <h2 className="text-foreground text-sm font-semibold">持仓明细</h2>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {item.positions.length} 只标的
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-[11px] tracking-wider uppercase">
                <th className="px-6 py-3 font-medium">标的</th>
                <th className="px-4 py-3 text-right font-medium">数量</th>
                <th className="px-4 py-3 text-right font-medium">成本价</th>
                <th className="px-4 py-3 text-right font-medium">现价</th>
                <th className="px-4 py-3 text-right font-medium">市值</th>
                <th className="px-4 py-3 text-right font-medium">盈亏</th>
                <th className="px-4 py-3 text-right font-medium">占比</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, qty, cost, lastPrice, mv, pnl, pnlPct, weight }) => (
                <tr key={p.id} className="border-border border-b last:border-b-0">
                  <td className="px-6 py-4">
                    <div className="text-foreground font-medium">{p.name || p.symbol}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {p.symbol} · {p.market}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">{qty.toLocaleString(locale)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatPortfolioAmount(String(cost), p.currency, locale)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {lastPrice != null ? formatPortfolioAmount(String(lastPrice), p.currency, locale) : "—"}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {mv != null ? formatPortfolioAmount(String(mv), p.currency, locale) : "—"}
                  </td>
                  <td className={cn("px-4 py-4 text-right tabular-nums", pnlTone(pnl))}>
                    {pnl != null ? (
                      <>
                        {pnl > 0 ? "+" : ""}
                        {formatPortfolioAmount(String(pnl), p.currency, locale)}
                        <span className="text-muted-foreground ml-1 text-xs">
                          {signedPct(pnlPct)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">{weight.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* cash */}
      {item.cashBalances.length > 0 ? (
        <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">现金余额</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.cashBalances.map((b) => (
              <span key={b.id} className="border-border rounded-full border px-3 py-1.5 text-sm tabular-nums">
                {formatPortfolioAmount(b.amount, b.currency, locale)}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card px-6 py-5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn("mt-1.5 font-serif text-2xl font-normal tracking-[-0.02em] tabular-nums", strong && "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
