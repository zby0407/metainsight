"use client";

import { AlertTriangleIcon, CheckCircleIcon } from "lucide-react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { useStockPortfolioRisk } from "@/core/portfolio";
import { cn } from "@/lib/utils";

function AlertBadge({ alert }: { alert: boolean }) {
  return alert ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2F2] px-2.5 py-0.5 text-xs font-medium text-[#b91c1c]">
      <AlertTriangleIcon className="size-3" />
      需关注
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F9EE] px-2.5 py-0.5 text-xs font-medium text-[#478433]">
      <CheckCircleIcon className="size-3" />
      正常
    </span>
  );
}

export function RiskView(_props: { item: PortfolioDashboardItem }) {
  const { data: risk, isLoading } = useStockPortfolioRisk();

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="bg-muted h-40 animate-pulse rounded-2xl" />
        <div className="bg-muted h-56 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!risk) {
    return (
      <div className="border-border flex min-h-[300px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">风险数据暂不可用</p>
      </div>
    );
  }

  const drawdown = risk.drawdown;
  const concentration = risk.concentration;
  const sector = risk.sector_concentration;
  const stopLoss = risk.stop_loss;
  const thresholds = risk.thresholds ?? {};

  return (
    <div className="w-full space-y-6">
      {/* drawdown + stop loss summary */}
      <div className="border-border bg-card grid grid-cols-2 gap-[1px] overflow-hidden rounded-2xl border">
        <div className="bg-card px-6 py-5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">最大回撤</span>
            <AlertBadge alert={drawdown?.alert === true} />
          </div>
          <div className="mt-2 font-serif text-3xl font-normal tracking-[-0.02em] tabular-nums">
            {drawdown?.max_drawdown_pct != null
              ? `${Number(drawdown.max_drawdown_pct).toFixed(2)}%`
              : "—"}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            当前回撤 {drawdown?.current_drawdown_pct != null ? `${Number(drawdown.current_drawdown_pct).toFixed(2)}%` : "—"} · 阈值 {thresholds.drawdown_alert_pct ?? "—"}%
          </p>
        </div>
        <div className="bg-card px-6 py-5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">止损预警</span>
            <AlertBadge alert={stopLoss?.near_alert === true || (stopLoss?.triggered_count ?? 0) > 0} />
          </div>
          <div className="mt-2 font-serif text-3xl font-normal tracking-[-0.02em] tabular-nums">
            {stopLoss?.triggered_count ?? 0}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            触发 {stopLoss?.triggered_count ?? 0} · 接近 {stopLoss?.near_count ?? 0} · 阈值 {thresholds.stop_loss_alert_pct ?? "—"}%
          </p>
        </div>
      </div>

      {/* concentration */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-sm font-semibold">持仓集中度</h2>
          <AlertBadge alert={concentration?.alert === true} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          最大单一持仓占比 {concentration?.top_weight_pct != null ? `${Number(concentration.top_weight_pct).toFixed(1)}%` : "—"} · 阈值 {thresholds.concentration_alert_pct ?? "—"}%
        </p>
        <div className="mt-4 space-y-3">
          {(concentration?.top_positions ?? []).map((pos) => (
            <div key={pos.symbol} className="flex items-center gap-3">
              <span className="text-foreground/80 w-24 text-sm font-medium">{pos.symbol}</span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full", pos.is_alert ? "bg-[#b91c1c]" : "bg-[#3f6218]")}
                  style={{ width: `${Math.min(100, pos.weight_pct ?? 0)}%` }}
                />
              </div>
              <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
                {pos.weight_pct != null ? `${Number(pos.weight_pct).toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* sector concentration */}
      <section className="border-border bg-card rounded-2xl border p-6 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-sm font-semibold">行业集中度</h2>
          <AlertBadge alert={sector?.alert === true} />
        </div>
        <div className="mt-4 space-y-3">
          {(sector?.top_sectors ?? []).map((s) => (
            <div key={s.sector} className="flex items-center gap-3">
              <span className="text-foreground/80 w-24 text-sm font-medium">
                {s.sector === "UNCLASSIFIED" ? "未分类" : s.sector}
              </span>
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full", s.is_alert ? "bg-[#b91c1c]" : "bg-[#3f6218]")}
                  style={{ width: `${Math.min(100, s.weight_pct ?? 0)}%` }}
                />
              </div>
              <span className="text-muted-foreground w-14 text-right text-sm tabular-nums">
                {s.weight_pct != null ? `${Number(s.weight_pct).toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
