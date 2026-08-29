"use client";

import { ChevronRightIcon, StarIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { type PortfolioDashboardItem } from "@/core/finance";
import { useStockPortfolioRisk } from "@/core/portfolio";
import { cn } from "@/lib/utils";

function RailCard({
  title,
  onClose,
  children,
  className,
  closable = true,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  closable?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card relative rounded-2xl border p-5 shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-foreground/70 text-[10px] font-bold tracking-[0.18em] uppercase">
          {title}
        </span>
        {closable && onClose ? (
          <button
            onClick={onClose}
            className="text-foreground/40 hover:text-foreground flex size-6 items-center justify-center rounded-md transition-colors"
            aria-label="关闭"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function percent(value: string | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function PortfolioRightRail({
  item,
  onReview,
}: {
  item: PortfolioDashboardItem;
  onReview?: () => void;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const hide = (key: string) => setHidden((h) => ({ ...h, [key]: true }));
  const { data: risk } = useStockPortfolioRisk();

  const cashWeight = percent(item.performance?.cashWeight);
  const maxDrawdownPct = risk?.drawdown?.max_drawdown_pct;
  const volatility = percent(item.performance?.annualizedVolatility);
  const cashPct = cashWeight != null ? Math.round(cashWeight * 100) : null;

  return (
    <aside className="border-border bg-background hidden h-full w-[300px] shrink-0 space-y-4 overflow-y-auto border-l px-5 py-6 xl:block">
      {/* gradient promo card */}
      {!hidden.recap ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#161412] to-[#3f6218] p-5 text-white shadow-[0_4px_16px_rgba(22,20,18,0.12)]">
          <button
            onClick={() => hide("recap")}
            className="absolute top-4 right-4 text-white/60 transition-colors hover:text-white"
            aria-label="关闭"
          >
            <XIcon className="size-3.5" />
          </button>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-80">
            组合复盘
          </span>
          <p className="mt-3 font-serif text-xl font-normal tracking-[-0.02em]">
            让 AI 帮你复盘本周组合
          </p>
          <p className="mt-2 text-xs leading-5 opacity-80">
            一键生成组合表现、风险与调仓建议。
          </p>
          <button
            onClick={onReview}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3.5 py-2 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-white/25"
          >
            立即复盘
            <ChevronRightIcon className="size-3.5" />
          </button>
        </div>
      ) : null}

      {/* market brief */}
      {!hidden.brief ? (
        <RailCard title="市场简报" onClose={() => hide("brief")}>
          <p className="text-foreground/80 text-sm font-medium">每日市场速递</p>
          <p className="text-muted-foreground mt-1.5 text-xs leading-5">
            关注与你持仓相关的行情异动与资讯，复盘时自动引用。
          </p>
        </RailCard>
      ) : null}

      {/* cash allocation progress */}
      {!hidden.cash ? (
        <RailCard title="现金占比" onClose={() => hide("cash")} closable={false}>
          <div className="flex items-center justify-between">
            <div className="text-foreground font-serif text-2xl font-normal tabular-nums">
              {cashPct != null ? `${cashPct}%` : "—"}
            </div>
            <button className="text-foreground/40 hover:text-foreground">
              <StarIcon className="size-4" />
            </button>
          </div>
          <div className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[#3f6218] transition-all"
              style={{ width: `${cashPct ?? 0}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            当前组合现金仓位占比
          </p>
        </RailCard>
      ) : null}

      {/* risk metrics */}
      {!hidden.risk ? (
        <RailCard title="风险指标" onClose={() => hide("risk")} closable={false}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">最大回撤</span>
              <span className="text-foreground text-sm font-medium tabular-nums">
                {maxDrawdownPct != null
                  ? `${Number(maxDrawdownPct).toFixed(2)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">年化波动率</span>
              <span className="text-foreground text-sm font-medium tabular-nums">
                {volatility != null ? `${(volatility * 100).toFixed(2)}%` : "—"}
              </span>
            </div>
          </div>
          <button className="text-foreground/70 hover:text-foreground mt-4 flex items-center gap-1 text-xs font-medium transition-colors">
            查看完整风险诊断
            <ChevronRightIcon className="size-3.5" />
          </button>
        </RailCard>
      ) : null}
    </aside>
  );
}
