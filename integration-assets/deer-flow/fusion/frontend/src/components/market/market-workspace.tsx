"use client";

import {
  ActivityIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  ChevronRightIcon,
  Clock3Icon,
  ExternalLinkIcon,
  GaugeIcon,
  MessageSquarePlusIcon,
  NewspaperIcon,
  RefreshCwIcon,
  SparklesIcon,
  StarIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DSA_API = "/market-api/api/v1";
const REFRESH_INTERVAL_MS = 60_000;

interface MarketIndex {
  code: string;
  name: string;
  current: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  amount: number;
  amplitude: number;
}

interface SectorMove {
  name: string;
  change_pct: number;
}

interface MarketNews {
  title: string;
  snippet?: string;
  source: string;
  published_date?: string | null;
  url: string;
}

interface MarketLight {
  status: string;
  score: number;
  label: string;
  temperature_label: string;
  reasons: string[];
  guidance: string;
}

interface MarketBreadth {
  up_count: number;
  down_count: number;
  flat_count: number;
  limit_up_count: number;
  limit_down_count: number;
  total_amount: number;
  turnover_unit: string;
}

interface MarketReviewPayload {
  title: string;
  date: string;
  generated_at: string;
  market_scope: string;
  region?: string;
  indices?: MarketIndex[] | null;
  sectors?: {
    top?: SectorMove[] | null;
    bottom?: SectorMove[] | null;
  } | null;
  news?: MarketNews[] | null;
  market_light?: MarketLight | null;
  breadth?: MarketBreadth | null;
}

interface HistoryItem {
  id: number;
  stock_code: string;
  stock_name: string;
  report_type: string;
  trend_prediction?: string | null;
  analysis_summary?: string | null;
  operation_advice?: string | null;
  action?: string | null;
  action_label?: string | null;
  sentiment_score?: number | null;
  current_price?: number | null;
  change_pct?: number | null;
  created_at: string;
}

interface IntelligenceItem {
  id: number;
  title: string;
  summary?: string;
  url: string;
  source: string;
  published_at?: string | null;
  fetched_at?: string | null;
}

interface Quote {
  stock_code: string;
  stock_name: string;
  current_price: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  amount: number;
  update_time: string;
}

interface KLinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent?: number | null;
}

interface WatchlistStock {
  code: string;
  quote: Quote | null;
  history: KLinePoint[];
}

interface DashboardData {
  market: MarketReviewPayload | null;
  watchlist: WatchlistStock[];
  recentResearch: HistoryItem[];
  intelligence: IntelligenceItem[];
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await globalThis.fetch(path, {
    cache: "no-store",
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "刚刚更新";
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value
    : `${value}+08:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function percentTone(value: number | null | undefined) {
  if (!value) return "text-muted-foreground";
  return value > 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400";
}

function percentBackground(value: number | null | undefined) {
  if (!value) return "bg-muted text-muted-foreground";
  return value > 0
    ? "bg-rose-500/10 text-rose-500"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
}

function researchHref(stock: string, name?: string, recordId?: number) {
  const params = new URLSearchParams({ stock });
  if (name) params.set("name", name);
  if (recordId) params.set("recordId", String(recordId));
  return `/workspace/chats/new?${params.toString()}`;
}

function MiniTrendBars({ data, positive }: { data: KLinePoint[]; positive: boolean }) {
  const values = data.slice(-22).map((point) => point.close);
  if (values.length < 2) {
    return <div className="h-10 rounded-md bg-muted/50" />;
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;

  return (
    <div className="flex h-10 items-end gap-0.5 overflow-hidden" aria-hidden>
      {values.map((value, index) => (
        <span
          className={cn(
            "min-w-0 flex-1 rounded-[2px] opacity-75",
            positive ? "bg-rose-400" : "bg-emerald-500",
          )}
          key={`${index}-${value}`}
          style={{ height: `${22 + ((value - minimum) / range) * 78}%` }}
        />
      ))}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-32 rounded-xl" key={index} />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-[620px] w-full rounded-2xl" />
    </div>
  );
}

function MarketPulse({ market }: { market: MarketReviewPayload }) {
  const light = market.market_light;
  const score = light?.score ?? 50;
  const breadth = market.breadth;
  const participated = (breadth?.up_count ?? 0) + (breadth?.down_count ?? 0);
  const upRatio = breadth && participated > 0 ? (breadth.up_count / participated) * 100 : null;
  const reasons = light?.reasons?.filter(Boolean) ?? [];

  return (
    <Card className="relative gap-0 overflow-hidden rounded-2xl py-0 shadow-none">
      <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
      <CardHeader className="gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <ActivityIcon />
              {light?.temperature_label || "数据更新中"} · {light?.label || "需观察"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {market.market_scope} · {formatDateTime(market.generated_at)}
            </span>
          </div>
          <div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              {light?.guidance || market.title || "市场信号仍在汇总"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {reasons.length > 0 ? reasons.join("；") : "部分市场结构数据暂未返回，已保留可用行情与资讯。"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-muted/35 p-4">
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">市场温度</span>
            <span className="text-3xl font-semibold tabular-nums">{score}</span>
          </div>
          <Progress className="mt-3 h-1.5" value={score} />
          <p className="mt-3 text-xs text-muted-foreground">100 为最活跃，基于宽度、指数与涨跌停</p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-px border-t bg-border p-0 sm:grid-cols-4">
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">上涨 / 下跌</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            <span className="text-rose-500">{breadth?.up_count ?? "—"}</span>
            <span className="mx-1.5 text-muted-foreground">/</span>
            <span className="text-emerald-600 dark:text-emerald-400">{breadth?.down_count ?? "—"}</span>
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">上涨占比</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {upRatio === null ? "—" : `${formatNumber(upRatio, 1)}%`}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">涨停 / 跌停</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {breadth ? `${breadth.limit_up_count} / ${breadth.limit_down_count}` : "—"}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">两市成交额</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {breadth ? `${formatNumber(breadth.total_amount, 0)} ${breadth.turnover_unit}` : "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function IndexGrid({ indices }: { indices: MarketIndex[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">主要指数</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">收盘数据与日内振幅</p>
        </div>
        <Badge variant="outline">A 股</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indices.map((index) => {
          const positive = index.change_pct >= 0;
          return (
            <Card className="gap-0 py-0 shadow-none" key={index.code}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{index.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{index.code}</p>
                  </div>
                  <span className={cn("rounded-md px-2 py-1 text-xs font-medium", percentBackground(index.change_pct))}>
                    {positive ? "+" : ""}{formatNumber(index.change_pct)}%
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <p className="text-2xl font-semibold tabular-nums">{formatNumber(index.current)}</p>
                  <p className="text-xs text-muted-foreground">振幅 {formatNumber(index.amplitude)}%</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SectorList({ title, items, positive }: { title: string; items: SectorMove[]; positive: boolean }) {
  const maximum = Math.max(...items.map((item) => Math.abs(item.change_pct)), 1);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {positive ? (
          <ArrowUpRightIcon className="size-4 text-rose-500" />
        ) : (
          <ArrowDownRightIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        )}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.name}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">{item.name}</span>
              <span className={cn("font-medium tabular-nums", percentTone(item.change_pct))}>
                {item.change_pct > 0 ? "+" : ""}{formatNumber(item.change_pct)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", positive ? "bg-rose-400" : "bg-emerald-500")}
                style={{ width: `${Math.max(8, (Math.abs(item.change_pct) / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketStructure({ market }: { market: MarketReviewPayload }) {
  const topSectors = market.sectors?.top ?? [];
  const bottomSectors = market.sectors?.bottom ?? [];

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3Icon className="size-4" />
          板块强弱
        </CardTitle>
        <CardDescription>观察资金从防御向进攻方向的切换</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-7 p-5 sm:grid-cols-2">
        <SectorList items={topSectors} positive title="领涨行业" />
        <SectorList items={bottomSectors} positive={false} title="领跌行业" />
      </CardContent>
    </Card>
  );
}

function NewsPanel({ items }: { items: MarketNews[] | IntelligenceItem[] }) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <NewspaperIcon className="size-4" />
          市场资讯
        </CardTitle>
        <CardDescription>DSA 已抓取并沉淀的最新公开信息</CardDescription>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {items.slice(0, 7).map((item) => {
          const time = "published_date" in item ? item.published_date : item.published_at ?? item.fetched_at;
          return (
            <a
              className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50"
              href={item.url}
              key={`${item.url}-${item.title}`}
              rel="noreferrer"
              target="_blank"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/45 group-hover:bg-foreground" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-5">{item.title}</span>
                <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{item.source}</span>
                  <span>·</span>
                  <span>{formatDateTime(time)}</span>
                </span>
              </span>
              <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ResearchPanel({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" />
          最近研究
        </CardTitle>
        <CardDescription>DSA 的研究结论，可直接带入知衡继续追问</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        {items.slice(0, 4).map((item) => (
          <Link
            className="group rounded-xl border p-4 transition-colors hover:bg-muted/45"
            href={researchHref(item.stock_code, item.stock_name, item.id)}
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.stock_name || item.stock_code}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.stock_code}</p>
              </div>
              <Badge className="shrink-0" variant="secondary">
                {item.action_label || item.action || "已分析"}
              </Badge>
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {item.analysis_summary || item.trend_prediction || "打开研究结论并继续追问"}
            </p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{formatDateTime(item.created_at)}</span>
              <span className="flex items-center gap-1 text-foreground opacity-70 group-hover:opacity-100">
                继续研究 <ChevronRightIcon className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function WatchlistPanel({
  stocks,
  refreshing,
  onRefresh,
}: {
  stocks: WatchlistStock[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const rising = stocks.filter((stock) => (stock.quote?.change_percent ?? 0) > 0).length;
  const falling = stocks.filter((stock) => (stock.quote?.change_percent ?? 0) < 0).length;

  return (
    <Card className="gap-0 py-0 shadow-none xl:sticky xl:top-4">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <StarIcon className="size-4" />
          关注概览
        </CardTitle>
        <CardDescription>{stocks.length} 个标的 · {rising} 涨 · {falling} 跌</CardDescription>
        <div className="ml-auto">
          <Button aria-label="刷新关注列表" disabled={refreshing} onClick={onRefresh} size="icon-sm" variant="ghost">
            <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-2">
          {stocks.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-8 text-center">
              <StarIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">还没有关注的股票</p>
              <p className="mt-1 text-xs text-muted-foreground">前往完整关注列表添加标的</p>
            </div>
          ) : null}

          {stocks.slice(0, 5).map(({ code, quote }) => {
            const positive = (quote?.change_percent ?? 0) >= 0;
            const name = quote?.stock_name || code;
            return (
              <Link
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
                href={researchHref(code, name)}
                key={code}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{code}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatNumber(quote?.current_price)}</p>
                  <p className={cn("mt-0.5 text-[11px] font-medium tabular-nums", percentTone(quote?.change_percent))}>
                    {positive ? "+" : ""}{formatNumber(quote?.change_percent)}%
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
        <Button asChild className="mt-4 w-full" variant="secondary">
          <Link href="/workspace/watchlist">
            打开完整关注列表 <ChevronRightIcon />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function MarketWorkspace() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [watchlistResponse, marketHistory, recentHistory, intelligenceResponse] = await Promise.all([
        getJson<{ stock_codes?: string[] }>(`${DSA_API}/stocks/watchlist`),
        getJson<{ items: HistoryItem[] }>(`${DSA_API}/history?report_type=market_review&limit=8`),
        getJson<{ items: HistoryItem[] }>(`${DSA_API}/history?limit=10`),
        getJson<{ items: IntelligenceItem[] }>(`${DSA_API}/intelligence/items?market=cn&page_size=8`),
      ]);

      const marketRecords = marketHistory.items ?? [];
      const marketDetails = await Promise.all(
        marketRecords.slice(0, 8).map((marketRecord) =>
          getJson<{
            details?: {
              context_snapshot?: { market_review_payload?: MarketReviewPayload };
            };
          }>(`${DSA_API}/history/${marketRecord.id}`).catch(() => null),
        ),
      );
      const marketPayloads = marketDetails
        .map((detail) => detail?.details?.context_snapshot?.market_review_payload)
        .filter((payload): payload is MarketReviewPayload => Boolean(payload));
      const marketPayload =
        marketPayloads.find(
          (payload) => payload.region === "cn" || payload.market_scope?.includes("A股"),
        ) ?? marketPayloads[0] ?? null;

      const codes = watchlistResponse.stock_codes ?? [];
      const stocks = await Promise.all(
        codes.map(async (code): Promise<WatchlistStock> => {
          const [quote, history] = await Promise.all([
            getJson<Quote>(`${DSA_API}/stocks/${encodeURIComponent(code)}/quote`).catch(() => null),
            getJson<{ data?: KLinePoint[] }>(
              `${DSA_API}/stocks/${encodeURIComponent(code)}/history?period=daily&days=30`,
            ).catch(() => ({ data: [] })),
          ]);
          return { code, quote, history: history.data ?? [] };
        }),
      );

      setData({
        market: marketPayload,
        watchlist: stocks,
        recentResearch: (recentHistory.items ?? []).filter(
          (item) => item.stock_code !== "MARKET" && item.report_type !== "market_review",
        ),
        intelligence: intelligenceResponse.items ?? [],
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "市场数据暂时不可用");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const newsItems = useMemo(
    () => (data?.market?.news?.length ? data.market.news : data?.intelligence ?? []),
    [data],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" />
              <h1 className="font-semibold">股票市场</h1>
              <Badge className="hidden sm:inline-flex" variant="outline">DSA 实时数据</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">行情、资讯和研究结论已接入知衡</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button disabled={refreshing} onClick={() => void loadDashboard()} size="sm" variant="ghost">
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
              <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button asChild size="sm">
              <Link href="/workspace/chats/new?market=cn">
                <MessageSquarePlusIcon />
                研究今日市场
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
          {!data && !error ? <LoadingDashboard /> : null}

          {error && !data ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-2xl border p-8 text-center">
                <GaugeIcon className="mx-auto size-7 text-muted-foreground" />
                <h2 className="mt-4 font-semibold">市场数据连接失败</h2>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <Button className="mt-5" onClick={() => void loadDashboard()} variant="outline">
                  <RefreshCwIcon />重新连接
                </Button>
              </div>
            </div>
          ) : null}

          {data ? (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-5">
                {data.market ? (
                  <>
                    <MarketPulse market={data.market} />
                    {(data.market.indices?.length ?? 0) > 0 ? (
                      <IndexGrid indices={data.market.indices ?? []} />
                    ) : null}
                    {((data.market.sectors?.top?.length ?? 0) > 0 ||
                      (data.market.sectors?.bottom?.length ?? 0) > 0) ? (
                      <MarketStructure
                        market={{
                          ...data.market,
                          sectors: {
                            top: data.market.sectors?.top ?? [],
                            bottom: data.market.sectors?.bottom ?? [],
                          },
                        }}
                      />
                    ) : null}
                  </>
                ) : (
                  <Card className="gap-2 p-6 shadow-none">
                    <CardTitle>尚无今日大盘复盘</CardTitle>
                    <CardDescription>DSA 完成市场复盘后，这里会自动展示指数、宽度和板块结构。</CardDescription>
                  </Card>
                )}

                <div className="grid items-start gap-5 lg:grid-cols-2">
                  <NewsPanel items={newsItems} />
                  <ResearchPanel items={data.recentResearch} />
                </div>
              </div>

              <WatchlistPanel
                onRefresh={() => void loadDashboard()}
                refreshing={refreshing}
                stocks={data.watchlist}
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock3Icon className="size-3" /> 数据来自 Daily Stock Analyze，研究由知衡完成
            </span>
            <span>市场信息仅供研究，不构成投资建议</span>
          </div>
        </div>
      </main>
    </div>
  );
}
