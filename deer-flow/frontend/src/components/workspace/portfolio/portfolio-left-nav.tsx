"use client";

import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import {
  SERVICE_ITEMS,
  TRACK_ITEMS,
  type PortfolioView,
} from "./views";

export function PortfolioLeftNav({
  portfolios,
  selectedId,
  onSelect,
  onRefresh,
  refreshing,
  activeView,
  onViewChange,
}: {
  portfolios: PortfolioDashboardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  activeView: PortfolioView;
  onViewChange: (view: PortfolioView) => void;
}) {
  const { locale } = useI18n();

  return (
    <aside className="border-border bg-background flex h-full w-[240px] shrink-0 flex-col border-r">
      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <div className="text-muted-foreground px-3 text-[10px] font-bold tracking-[0.18em] uppercase">
          跟踪
        </div>
        <ul className="mt-3 space-y-0.5">
          {TRACK_ITEMS.map((item) => {
            const active = activeView === item.view;
            return (
              <li key={item.view}>
                <button
                  onClick={() => onViewChange(item.view)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground/60 hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {!item.implemented ? (
                    <span className="text-muted-foreground ml-auto text-[10px]">·</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="text-muted-foreground mt-8 px-3 text-[10px] font-bold tracking-[0.18em] uppercase">
          我的组合
        </div>
        <ul className="mt-3 space-y-0.5">
          {portfolios.map((item) => {
            const active = item.portfolio.id === selectedId;
            return (
              <li key={item.portfolio.id}>
                <button
                  onClick={() => onSelect(item.portfolio.id)}
                  aria-pressed={active}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-foreground truncate text-sm font-medium">
                      {item.portfolio.name}
                    </span>
                    {item.portfolio.status === "active" ? (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    ) : null}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {item.latestSnapshot
                      ? formatPortfolioAmount(
                          item.latestSnapshot.totalEquity,
                          item.latestSnapshot.baseCurrency,
                          locale,
                        )
                      : "—"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="text-muted-foreground mt-8 px-3 text-[10px] font-bold tracking-[0.18em] uppercase">
          服务
        </div>
        <ul className="mt-3 space-y-0.5">
          {SERVICE_ITEMS.map((item) => {
            const active = activeView === item.view;
            return (
              <li key={item.view}>
                <button
                  onClick={() => onViewChange(item.view)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground/60 hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                  {!item.implemented ? (
                    <span className="text-muted-foreground ml-auto text-[10px]">·</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={onRefresh}
          className="text-muted-foreground hover:text-foreground mt-6 flex items-center gap-2 px-3 text-xs transition-colors"
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
          刷新数据
        </button>
      </nav>

      <div className="border-border border-t p-4">
        <Link
          href="/workspace/chats/new"
          className="bg-foreground text-background flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
        >
          <SparklesIcon className="size-4 text-[#c5e69e]" />
          问点什么
        </Link>
      </div>
    </aside>
  );
}
