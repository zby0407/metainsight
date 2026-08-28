"use client";

import {
  AlertCircleIcon,
  ArrowRightIcon,
  PlusIcon,
  RefreshCwIcon,
  WalletCardsIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatPortfolioAmount,
  createPortfolioWorkflowChatHref,
  type PortfolioDashboardItem,
  type PortfolioSetupResponse,
  type PortfolioWorkflowKind,
  usePortfolioDashboard,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import { PortfolioSetupWizard } from "./portfolio-setup-wizard";

type WorkspaceView = "overview" | "holdings" | PortfolioWorkflowKind;

function formatDecimal(value: string, locale: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(
    amount,
  );
}

function formatDate(value: string, locale: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}

function formatPercent(value: string | null | undefined, locale: string) {
  if (value == null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(amount);
}

function performanceTone(value: string | null | undefined, locale: string) {
  if (value == null) return "text-foreground";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "text-foreground";
  const chineseMarketConvention = locale.toLowerCase().startsWith("zh");
  if (amount > 0) {
    return chineseMarketConvention
      ? "text-red-600 dark:text-red-400"
      : "text-emerald-600 dark:text-emerald-400";
  }
  return chineseMarketConvention
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

function signedAmount(
  value: string | null | undefined,
  currency: string,
  locale: string,
) {
  if (value == null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const formatted = formatPortfolioAmount(value, currency, locale);
  return amount > 0 ? `+${formatted}` : formatted;
}

function PerformanceMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
          tone,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PortfolioPerformance({ item }: { item: PortfolioDashboardItem }) {
  const { locale, t } = useI18n();
  const labels = t.investmentAgent;
  const { portfolio, latestSnapshot, performance } = item;
  const primaryReturn =
    performance?.cumulativeReturn ?? performance?.unrealizedReturn;
  const primaryReturnLabel = performance?.cumulativeReturn
    ? labels.portfolioCumulativeReturn
    : labels.portfolioUnrealizedReturn;
  const performanceStatus = performance?.live
    ? labels.portfolioPerformanceLive
    : performance
      ? {
          complete: labels.portfolioPerformanceComplete,
          partial: labels.portfolioPerformancePartial,
          insufficient_data: labels.portfolioPerformanceInsufficient,
        }[performance.status]
      : labels.portfolioPerformanceInsufficient;

  return (
    <section
      data-testid="portfolio-performance"
      aria-labelledby="portfolio-performance-title"
      className="border-y"
    >
      <div className="flex items-center gap-3 py-3">
        <h3 id="portfolio-performance-title" className="text-sm font-medium">
          {labels.portfolioPerformance}
        </h3>
        <span className="text-muted-foreground ml-auto text-xs">
          {performanceStatus}
        </span>
      </div>
      <div className="grid grid-cols-2 border-t lg:grid-cols-4 [&>*]:border-r [&>*]:border-b [&>*:nth-child(2n)]:border-r-0 lg:[&>*:nth-child(2n)]:border-r lg:[&>*:nth-child(4n)]:border-r-0 [&>*:nth-last-child(-n+2)]:border-b-0 lg:[&>*:nth-last-child(-n+4)]:border-b-0">
        <PerformanceMetric
          label={labels.portfolioEquity}
          value={
            latestSnapshot
              ? formatPortfolioAmount(
                  latestSnapshot.totalEquity,
                  latestSnapshot.baseCurrency,
                  locale,
                )
              : "—"
          }
        />
        <PerformanceMetric
          label={primaryReturnLabel}
          value={formatPercent(primaryReturn, locale)}
          tone={performanceTone(primaryReturn, locale)}
        />
        <PerformanceMetric
          label={labels.portfolioDailyReturn}
          value={formatPercent(performance?.dailyReturn, locale)}
          tone={performanceTone(performance?.dailyReturn, locale)}
        />
        <PerformanceMetric
          label={labels.portfolioDailyPnl}
          value={signedAmount(
            performance?.dailyPnl,
            latestSnapshot?.baseCurrency ?? portfolio.baseCurrency,
            locale,
          )}
          tone={performanceTone(performance?.dailyPnl, locale)}
        />
        <PerformanceMetric
          label={labels.portfolioPositions}
          value={String(item.positions.length)}
        />
        <PerformanceMetric
          label={labels.portfolioCashWeight}
          value={formatPercent(performance?.cashWeight, locale)}
        />
        <PerformanceMetric
          label={labels.portfolioMaxDrawdown}
          value={formatPercent(performance?.maxDrawdown, locale)}
          tone={performanceTone(performance?.maxDrawdown, locale)}
        />
        <PerformanceMetric
          label={labels.portfolioVolatility}
          value={formatPercent(performance?.annualizedVolatility, locale)}
        />
      </div>
    </section>
  );
}

function splitReviewHighlights(summary: string, locale: string) {
  const delimiter = locale.toLowerCase().startsWith("zh")
    ? /(?<=[。！？])/u
    : /(?<=[.!?])\s+/u;
  const highlights = summary
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  if (highlights.length <= 8) return highlights;
  return [...highlights.slice(0, 7), highlights.slice(7).join(" ")];
}

function ReviewHighlights({ summary }: { summary: string }) {
  const { locale } = useI18n();
  const highlights = splitReviewHighlights(summary, locale);
  return (
    <ol className="mt-4 border-y">
      {highlights.map((highlight, index) => (
        <li
          key={`${index}-${highlight}`}
          className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b py-3.5 last:border-b-0"
        >
          <span className="text-muted-foreground text-xs tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="text-sm leading-6">{highlight}</p>
        </li>
      ))}
    </ol>
  );
}

function LatestReview({ item }: { item: PortfolioDashboardItem }) {
  const { locale, t } = useI18n();
  const labels = t.investmentAgent;
  const review = item.latestReview;
  const assessmentLabel = review
    ? {
        on_track: labels.assessmentOnTrack,
        watch: labels.assessmentWatch,
        breached: labels.assessmentBreached,
        insufficient_data: labels.assessmentInsufficient,
      }[review.assessment]
    : null;

  return (
    <section aria-labelledby="latest-review-title" className="border-t pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="latest-review-title" className="text-sm font-semibold">
          {labels.portfolioLatestReview}
        </h3>
        {assessmentLabel ? (
          <span className="text-muted-foreground text-xs">
            {assessmentLabel}
          </span>
        ) : null}
        {review ? (
          <time className="text-muted-foreground ml-auto text-xs">
            {formatDate(review.reviewDate, locale)}
          </time>
        ) : null}
      </div>
      {review ? (
        <ReviewHighlights summary={review.summary} />
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">
          {labels.portfolioNoReview}
        </p>
      )}
    </section>
  );
}

function HoldingsTable({ item }: { item: PortfolioDashboardItem }) {
  const { locale, t } = useI18n();
  const labels = t.investmentAgent;
  const hasAccountData =
    item.positions.length > 0 || item.cashBalances.length > 0;

  if (!hasAccountData) {
    return (
      <div className="text-muted-foreground flex min-h-52 items-center justify-center border-y p-6 text-center text-sm">
        {labels.portfolioNoHoldings}
      </div>
    );
  }

  return (
    <div data-testid="portfolio-holdings" className="space-y-5">
      {item.positions.length > 0 ? (
        <div className="overflow-hidden border-y">
          <div className="flex items-center gap-3 border-b py-3">
            <h3 className="text-sm font-medium">{labels.portfolioPositions}</h3>
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {item.positions.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-muted-foreground bg-muted/25 text-xs">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    {labels.portfolioPositions}
                  </th>
                  <th className="px-5 py-3 font-medium">
                    {labels.portfolioQuantity}
                  </th>
                  <th className="px-5 py-3 font-medium">
                    {labels.portfolioAverageCost}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {labels.portfolioAsOf}
                  </th>
                </tr>
              </thead>
              <tbody>
                {item.positions.map((position) => (
                  <tr key={position.id} className="border-t first:border-t-0">
                    <td className="px-5 py-4">
                      <div className="font-medium">{position.symbol}</div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {position.name || position.market} · {position.market}
                      </div>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {formatDecimal(position.quantity, locale)}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {formatPortfolioAmount(
                        position.averageCost,
                        position.currency,
                        locale,
                      )}
                    </td>
                    <td className="text-muted-foreground px-5 py-4 text-right text-xs">
                      {formatDate(position.asOf, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {item.cashBalances.length > 0 ? (
        <section className="border-t pt-4">
          <h3 className="text-muted-foreground text-xs font-medium">
            {labels.portfolioCash}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.cashBalances.map((balance) => (
              <Badge
                key={balance.id}
                variant="outline"
                className="px-3 py-1.5 text-sm tabular-nums"
              >
                {formatPortfolioAmount(
                  balance.amount,
                  balance.currency,
                  locale,
                )}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WorkflowWorkspace({
  kind,
  item,
  onRun,
}: {
  kind: PortfolioWorkflowKind;
  item: PortfolioDashboardItem;
  onRun: (kind: PortfolioWorkflowKind) => void;
}) {
  const { locale, t } = useI18n();
  const labels = t.investmentAgent;
  const titles = {
    review: labels.portfolioReviewAction,
    risk: labels.portfolioRiskAction,
    strategy: labels.portfolioStrategyAction,
    sandbox: labels.portfolioSandboxAction,
  };
  const descriptions = {
    review: labels.workflowReviewDescription,
    risk: labels.workflowRiskDescription,
    strategy: labels.workflowStrategyDescription,
    sandbox: labels.workflowSandboxDescription,
  };
  const brief =
    kind === "review"
      ? item.latestReview?.summary
      : item.workspaceBriefs?.[kind];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-h-56 flex-col justify-between border-t pt-5">
        <div>
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {labels.workspaceQuickActions}
          </div>
          <h3 className="mt-3 text-xl font-semibold">{titles[kind]}</h3>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
            {descriptions[kind]}
          </p>
          {brief && kind !== "review" ? (
            <div className="mt-5">
              <div className="text-muted-foreground text-xs">
                {labels.workspaceOpeningBrief}
              </div>
              <ReviewHighlights summary={brief} />
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          className="mt-6 w-fit"
          onClick={() => onRun(kind)}
        >
          {labels.workspaceRunNow}
          <ArrowRightIcon />
        </Button>
      </div>
      <div className="border-t pt-5">
        <div>
          <div className="text-muted-foreground text-xs">
            {labels.workspaceSnapshotBaseline}
          </div>
          <div className="mt-2 font-medium">
            {item.latestSnapshot
              ? formatDate(item.latestSnapshot.sessionDate, locale)
              : labels.portfolioNoSnapshot}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            {item.positions.length} {labels.portfolioPositions} · R
            {item.portfolio.revision}
          </div>
        </div>
        <div className="mt-5 border-t pt-4">
          <p className="text-muted-foreground text-xs leading-5">
            {labels.workspaceAgentReadyDescription}
          </p>
        </div>
      </div>
    </div>
  );
}

function Overview({
  item,
  onRun,
}: {
  item: PortfolioDashboardItem;
  onRun: (kind: PortfolioWorkflowKind) => void;
}) {
  const { t } = useI18n();
  const labels = t.investmentAgent;
  const workflowActions: {
    kind: PortfolioWorkflowKind;
    label: string;
    description: string;
  }[] = [
    {
      kind: "review",
      label: labels.portfolioReviewAction,
      description: labels.workflowReviewDescription,
    },
    {
      kind: "risk",
      label: labels.portfolioRiskAction,
      description: labels.workflowRiskDescription,
    },
    {
      kind: "strategy",
      label: labels.portfolioStrategyAction,
      description: labels.workflowStrategyDescription,
    },
    {
      kind: "sandbox",
      label: labels.portfolioSandboxAction,
      description: labels.workflowSandboxDescription,
    },
  ];

  return (
    <div className="space-y-7">
      <PortfolioPerformance item={item} />
      <LatestReview item={item} />
      {item.portfolio.status === "active" ? (
        <section className="border-t pt-5">
          <h3 className="text-sm font-semibold">
            {labels.workspaceQuickActions}
          </h3>
          <div className="mt-3 flex flex-wrap gap-x-1 border-y py-1">
            {workflowActions.map(({ kind, label, description }) => (
              <button
                key={kind}
                type="button"
                title={description}
                className="hover:bg-muted/60 group inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors"
                onClick={() => onRun(kind)}
              >
                {label}
                <ArrowRightIcon className="text-muted-foreground size-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <AlertCircleIcon className="size-4" />
          {labels.portfolioArchivedHint}
        </div>
      )}
    </div>
  );
}

function strategyChangeBasis(
  strategy: PortfolioDashboardItem["activeStrategy"],
): string[] {
  const policy = strategy?.policy;
  if (!policy || typeof policy !== "object") {
    return [];
  }
  const raw = (policy as Record<string, unknown>).changeBasis;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function StrategySummary({ item }: { item: PortfolioDashboardItem }) {
  const { t } = useI18n();
  const labels = t.investmentAgent;
  const strategy = item.activeStrategy;
  const changeBasis = strategyChangeBasis(strategy);

  return (
    <section className="mb-5 border-y py-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{labels.portfolioStrategy}</h3>
        {strategy ? (
          <span className="text-muted-foreground ml-auto text-xs">
            V{strategy.version}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6">
        {strategy?.objective ?? labels.portfolioNoStrategy}
      </p>
      {strategy?.horizon ? (
        <p className="text-muted-foreground mt-1 text-xs">{strategy.horizon}</p>
      ) : null}
      {changeBasis.length > 0 ? (
        <div className="mt-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wide">
            {labels.workspaceStrategyChangeBasis}
          </div>
          <ol className="mt-3 border-y">
            {changeBasis.map((item, index) => (
              <li
                key={`${index}-${item}`}
                className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0"
              >
                <span className="text-muted-foreground text-xs tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-6">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function PortfolioWorkspace({ item }: { item: PortfolioDashboardItem }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const labels = t.investmentAgent;
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");
  const { portfolio } = item;

  function runWorkflow(kind: PortfolioWorkflowKind) {
    router.push(createPortfolioWorkflowChatHref({ kind, portfolio, locale }));
  }

  return (
    <div
      data-testid="portfolio-workspace"
      className="min-w-0 flex-1 overflow-hidden"
    >
      <div className="border-b pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {portfolio.name}
              </h2>
              <Badge
                variant="outline"
                className={cn(
                  portfolio.status === "active"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground",
                )}
              >
                {portfolio.status === "active"
                  ? labels.portfolioStatusActive
                  : labels.portfolioStatusArchived}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
              {portfolio.purpose.trim()
                ? portfolio.purpose
                : (item.activeStrategy?.objective ?? "—")}
            </p>
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                {labels.portfolioRevision} R{portfolio.revision}
              </span>
              <span>
                {labels.portfolioBenchmark}: {portfolio.benchmark ?? "—"}
              </span>
              <span>{portfolio.baseCurrency}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as WorkspaceView)}
      >
        <div className="overflow-x-auto border-b">
          <TabsList variant="line" className="h-12 min-w-max">
            <TabsTrigger value="overview">
              {labels.workspaceOverviewTab}
            </TabsTrigger>
            <TabsTrigger value="holdings">
              {labels.workspaceHoldingsTab}
            </TabsTrigger>
            <TabsTrigger value="review">
              {labels.workspaceReviewTab}
            </TabsTrigger>
            <TabsTrigger value="risk">{labels.workspaceRiskTab}</TabsTrigger>
            <TabsTrigger value="strategy">
              {labels.workspaceStrategyTab}
            </TabsTrigger>
            <TabsTrigger value="sandbox">
              {labels.workspaceSandboxTab}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="py-6">
          <TabsContent value="overview">
            <Overview item={item} onRun={runWorkflow} />
          </TabsContent>
          <TabsContent value="holdings">
            <HoldingsTable item={item} />
          </TabsContent>
          <TabsContent value="review">
            <div className="mb-4">
              <LatestReview item={item} />
            </div>
            <WorkflowWorkspace kind="review" item={item} onRun={runWorkflow} />
          </TabsContent>
          <TabsContent value="risk">
            <WorkflowWorkspace kind="risk" item={item} onRun={runWorkflow} />
          </TabsContent>
          <TabsContent value="strategy">
            <StrategySummary item={item} />
            <WorkflowWorkspace
              kind="strategy"
              item={item}
              onRun={runWorkflow}
            />
          </TabsContent>
          <TabsContent value="sandbox">
            <WorkflowWorkspace kind="sandbox" item={item} onRun={runWorkflow} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Skeleton className="h-[520px] rounded-2xl" />
      <Skeleton className="h-[620px] rounded-2xl" />
    </div>
  );
}

export function PortfolioDashboard() {
  const { locale, t } = useI18n();
  const labels = t.investmentAgent;
  const { data, error, isLoading, isFetching, refetch } =
    usePortfolioDashboard();
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!data || data.portfolios.length === 0) {
      setSelectedPortfolioId(null);
      return;
    }
    if (
      !selectedPortfolioId ||
      !data.portfolios.some((item) => item.portfolio.id === selectedPortfolioId)
    ) {
      setSelectedPortfolioId(data.portfolios[0]?.portfolio.id ?? null);
    }
  }, [data, selectedPortfolioId]);

  const selectedPortfolio = data?.portfolios.find(
    (item) => item.portfolio.id === selectedPortfolioId,
  );

  async function completeSetup(result: PortfolioSetupResponse) {
    await refetch();
    setSelectedPortfolioId(result.portfolio.id);
    setSetupOpen(false);
  }

  return (
    <section aria-labelledby="my-portfolios-title" className="space-y-5">
      <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1
            id="my-portfolios-title"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {labels.title}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            {labels.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/workspace/agents/custom">{labels.customTitle}</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCwIcon className={cn(isFetching && "animate-spin")} />
            {labels.refreshPortfolios}
          </Button>
          <Button
            data-testid="portfolio-create-primary"
            onClick={() => setSetupOpen(true)}
          >
            <PlusIcon />
            {labels.createPortfolioAction}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="bg-destructive/5 flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-6 text-center">
          <div className="bg-background text-destructive flex size-11 items-center justify-center rounded-full border shadow-xs">
            <AlertCircleIcon className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">{labels.portfolioLoadError}</p>
            <p className="text-muted-foreground mt-1 max-w-lg text-xs">
              {error instanceof Error ? error.message : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCwIcon />
            {labels.retry}
          </Button>
        </div>
      ) : !data || data.portfolios.length === 0 ? (
        <div className="bg-muted/15 flex min-h-[430px] flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center">
          <div className="bg-background text-primary flex size-14 items-center justify-center rounded-2xl border shadow-sm">
            <WalletCardsIcon className="size-6" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">
            {labels.emptyPortfolioTitle}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-lg text-sm leading-6">
            {labels.emptyPortfolioDescription}
          </p>
          <Button
            data-testid="portfolio-create-empty"
            className="mt-5"
            onClick={() => setSetupOpen(true)}
          >
            <PlusIcon />
            {labels.createPortfolioAction}
          </Button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)]">
          <aside
            data-testid="portfolio-list"
            className="h-fit min-w-0 lg:sticky lg:top-5 lg:border-r lg:pr-5"
          >
            <div className="pb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                  {labels.myPortfoliosTitle}
                </h2>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {data.summary.portfolioCount}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                {labels.workspaceSelectHint}
              </p>
            </div>
            <div className="flex overflow-x-auto border-y lg:max-h-[520px] lg:flex-col lg:divide-y lg:overflow-y-auto">
              {data.portfolios.map((item) => {
                const active = item.portfolio.id === selectedPortfolioId;
                return (
                  <button
                    key={item.portfolio.id}
                    type="button"
                    className={cn(
                      "min-w-56 border-r p-3 text-left transition-colors last:border-r-0 lg:min-w-0 lg:border-r-0",
                      active ? "bg-muted/65" : "hover:bg-muted/35",
                    )}
                    aria-pressed={active}
                    onClick={() => setSelectedPortfolioId(item.portfolio.id)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.portfolio.name}
                      </span>
                      {item.portfolio.status === "active" ? (
                        <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" />
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          {labels.portfolioEquity}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {item.latestSnapshot
                            ? formatPortfolioAmount(
                                item.latestSnapshot.totalEquity,
                                item.latestSnapshot.baseCurrency,
                                locale,
                              )
                            : "—"}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          performanceTone(
                            item.performance?.cumulativeReturn ??
                              item.performance?.unrealizedReturn,
                            locale,
                          ),
                        )}
                      >
                        {formatPercent(
                          item.performance?.cumulativeReturn ??
                            item.performance?.unrealizedReturn,
                          locale,
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pt-3">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setSetupOpen(true)}
              >
                <PlusIcon />
                {labels.createPortfolioAction}
              </Button>
            </div>
          </aside>

          {selectedPortfolio ? (
            <PortfolioWorkspace
              key={selectedPortfolio.portfolio.id}
              item={selectedPortfolio}
            />
          ) : (
            <Skeleton className="h-[620px] rounded-2xl" />
          )}
        </div>
      )}

      <Sheet open={setupOpen} onOpenChange={setSetupOpen}>
        <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <SheetHeader className="sr-only">
            <SheetTitle>{labels.setupDialogTitle}</SheetTitle>
            <SheetDescription>{labels.setupDescription}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
            <PortfolioSetupWizard onCompleted={completeSetup} />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
