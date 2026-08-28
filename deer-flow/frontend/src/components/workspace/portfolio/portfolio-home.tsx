"use client";

import {
  AlertCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  WalletCardsIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/core/auth/AuthProvider";
import { type PortfolioDashboardItem } from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { useStockPortfolioDashboard } from "@/core/portfolio";
import { cn } from "@/lib/utils";

import { PortfolioHeader } from "./portfolio-header";
import { PortfolioLeftNav } from "./portfolio-left-nav";
import { PortfolioRightRail } from "./portfolio-right-rail";
import {
  AllocationView,
  EarningsView,
  HoldingsView,
  OverviewView,
  RiskView,
  type PortfolioView,
} from "./views";
import { ComingSoonView } from "./views/coming-soon-view";

function greetingForHour(hour: number, locale: string) {
  const zh = locale.toLowerCase().startsWith("zh");
  if (hour < 12) return zh ? "早上好" : "Good morning";
  if (hour < 18) return zh ? "下午好" : "Good afternoon";
  return zh ? "晚上好" : "Good evening";
}

export function PortfolioHome() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const { data, error, isLoading, isFetching, refetch } =
    useStockPortfolioDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<PortfolioView>("overview");

  // Real data only — no demo fallback. Empty while loading, error state on
  // failure, empty state when the account genuinely has no portfolios.
  const portfolios = useMemo(() => data?.portfolios ?? [], [data]);

  const firstPortfolioId = portfolios[0]?.portfolio.id ?? null;
  useEffect(() => {
    setSelectedId((current) =>
      current && portfolios.some((p) => p.portfolio.id === current)
        ? current
        : firstPortfolioId,
    );
    // Only re-evaluate when the available portfolio ids actually change.
     
  }, [firstPortfolioId, portfolios]);

  const selected: PortfolioDashboardItem | undefined = useMemo(
    () => portfolios.find((p) => p.portfolio.id === selectedId),
    [portfolios, selectedId],
  );

  const greeting = greetingForHour(new Date().getHours(), locale);
  const displayName = user?.email?.split("@")[0] ?? "";

  return (
    <div className="landing-scope flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <PortfolioHeader
        greeting={greeting}
        name={displayName}
        email={user?.email ?? ""}
      />

      <div className="flex min-h-0 flex-1 items-stretch">
        <PortfolioLeftNav
          portfolios={portfolios}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRefresh={() => void refetch()}
          refreshing={isFetching}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 md:px-8">
          {selected ? (
            <MainView view={activeView} item={selected} />
          ) : isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <ErrorState
              message={error instanceof Error ? error.message : ""}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : (
            <EmptyState />
          )}
        </main>

        {selected ? <PortfolioRightRail item={selected} /> : null}
      </div>
    </div>
  );
}

function MainView({
  view,
  item,
}: {
  view: PortfolioView;
  item: PortfolioDashboardItem;
}) {
  switch (view) {
    case "overview":
      return <OverviewView item={item} />;
    case "holdings":
      return <HoldingsView item={item} />;
    case "earnings":
      return <EarningsView item={item} />;
    case "allocation":
      return <AllocationView item={item} />;
    case "risk":
      return <RiskView item={item} />;
    case "forecast":
    case "review":
    case "strategy":
    case "sandbox":
      return <ComingSoonView view={view} />;
    default:
      return <OverviewView item={item} />;
  }
}

function DashboardSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="bg-muted h-[380px] animate-pulse rounded-2xl" />
      <div className="bg-muted h-[320px] animate-pulse rounded-2xl" />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="border-border flex min-h-[430px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
      <div className="bg-card text-destructive flex size-11 items-center justify-center rounded-full border shadow-sm">
        <AlertCircleIcon className="size-5" />
      </div>
      <p className="mt-4 text-sm font-medium">组合数据加载失败</p>
      <p className="text-muted-foreground mt-1 max-w-lg text-xs">{message}</p>
      <button
        onClick={onRetry}
        className="border-border bg-card hover:bg-muted mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
      >
        <RefreshCwIcon className={cn("size-4", retrying && "animate-spin")} />
        重试
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-border flex min-h-[430px] w-full flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
      <div className="bg-card text-foreground flex size-14 items-center justify-center rounded-2xl border shadow-sm">
        <WalletCardsIcon className="size-6" />
      </div>
      <h2 className="mt-5 font-serif text-xl font-normal tracking-[-0.02em]">
        还没有投资组合
      </h2>
      <p className="text-muted-foreground mt-2 max-w-lg text-sm leading-6">
        创建你的第一个投资组合，开始跟踪资产、收益与研究结论。
      </p>
      <button
        className={cn(
          "bg-foreground text-background mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90",
        )}
      >
        <PlusIcon className="size-4" />
        创建投资组合
      </button>
    </div>
  );
}
