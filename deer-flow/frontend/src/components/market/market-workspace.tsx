"use client";

import {
  ChevronRightIcon,
  Clock3Icon,
  ExternalLinkIcon,
  GaugeIcon,
  MessageSquarePlusIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  aShareSessionStatus,
  describeSectorRotation,
  formatCompactAmount,
  formatMarketNumber,
  indexRangePosition,
  resolveMarketStats,
  sparklinePath,
  temperatureTone,
} from "@/core/finance/market-workspace-presentation";
import {
  concludeRiskProfile,
  readStoredRiskProfile,
} from "@/core/finance/risk-profile";
import { cn } from "@/lib/utils";

const DSA_API = "/api/v1/market";
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
  policyHeadlines: Array<{
    title: string;
    summary?: string;
    source: string;
    url: string;
  }>;
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

function percentChip(value: number | null | undefined) {
  if (!value) return "bg-[#0B2A5B]/6 text-[#0B2A5B]/55";
  return value > 0
    ? "bg-rose-50 text-rose-600"
    : "bg-emerald-50 text-emerald-700";
}

function researchHref(stock: string, name?: string, recordId?: number) {
  const params = new URLSearchParams({ stock });
  if (name) params.set("name", name);
  if (recordId) params.set("recordId", String(recordId));
  return `/workspace/chats/new?${params.toString()}`;
}

function LoadingDashboard() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-36 rounded-2xl" key={index} />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
      <Skeleton className="h-[520px] w-full rounded-3xl" />
    </div>
  );
}

function Sparkline({
  values,
  positive,
}: {
  values: number[];
  positive: boolean;
}) {
  const path = sparklinePath(values);
  if (!path) return null;
  return (
    <svg
      aria-hidden
      className="h-7 w-[72px]"
      fill="none"
      viewBox="0 0 72 28"
    >
      <path
        d={path}
        stroke={positive ? "#f43f5e" : "#059669"}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function TemperatureMeter({ score }: { score: number }) {
  return (
    <div className="relative mt-3 h-2.5 overflow-visible rounded-full bg-[#0B2A5B]/8">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400 opacity-80" />
      <div
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0B2A5B] shadow-[0_0_0_4px_rgba(11,42,91,0.08)]"
        style={{ left: `${Math.min(96, Math.max(4, score))}%` }}
      />
    </div>
  );
}

function MarketPulse({ market }: { market: MarketReviewPayload }) {
  const light = market.market_light;
  const score = light?.score ?? 50;
  const stats = resolveMarketStats(market.breadth, market.indices ?? []);
  const reasons = light?.reasons?.filter(Boolean) ?? [];
  const session = aShareSessionStatus();
  const tone = temperatureTone(score);

  return (
    <section className="overflow-hidden rounded-3xl border border-[#0B2A5B]/10 bg-white shadow-[0_24px_80px_rgba(11,42,91,0.06)]">
      <div className="bg-[linear-gradient(165deg,#F7FBFF_0%,#FFFFFF_55%,#EBF2FF_100%)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              tone === "hot" || tone === "warm"
                ? "bg-rose-50 text-rose-600"
                : tone === "cold" || tone === "cool"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-[#EBF2FF] text-[#0B2A5B]",
            )}
          >
            {light?.temperature_label ?? "数据更新中"} · {light?.label ?? "需观察"}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px]",
              session.live
                ? "bg-[#0B2A5B] text-white"
                : "bg-white/80 text-[#0B2A5B]/70 ring-1 ring-[#0B2A5B]/10",
            )}
          >
            {session.live ? "● " : ""}
            {session.label}
          </span>
          <span className="text-[11px] text-[#0B2A5B]/50">
            {market.market_scope} · {formatDateTime(market.generated_at)}
          </span>
        </div>
        <h2 className="mt-4 max-w-4xl text-2xl font-semibold tracking-tight text-[#0B2A5B] sm:text-[28px] sm:leading-9">
          {light?.guidance ?? market.title ?? "市场信号仍在汇总"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#0B2A5B]/65">
          {session.detail}
          {stats.leader
            ? ` 主要指数里 ${stats.leader.name} ${stats.leader.change_pct >= 0 ? "领涨" : "领跌"} ${stats.leader.change_pct >= 0 ? "+" : ""}${formatMarketNumber(stats.leader.change_pct)}%。`
            : ""}
        </p>
        {reasons.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {reasons.slice(0, 4).map((reason) => (
              <span
                className="rounded-full bg-white/80 px-3 py-1 text-[11px] leading-5 text-[#0B2A5B]/70 ring-1 ring-[#0B2A5B]/8"
                key={reason}
              >
                {reason}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#0B2A5B]/55">
            部分市场结构数据暂未返回，已用主要指数补齐可观察的宽度。
          </p>
        )}

        <div className="mt-5 max-w-md">
          <div className="flex items-end justify-between text-xs text-[#0B2A5B]/55">
            <span>市场温度</span>
            <span className="text-lg font-semibold tabular-nums text-[#0B2A5B]">
              {score}
            </span>
          </div>
          <TemperatureMeter score={score} />
        </div>
      </div>

      <div className="grid border-t border-[#0B2A5B]/8 sm:grid-cols-2 lg:grid-cols-5">
        <StatCell
          hint={stats.source}
          label="上涨 / 下跌"
          value={
            <span className="tabular-nums">
              <span className="text-rose-500">{stats.upCount ?? "—"}</span>
              <span className="mx-1.5 text-[#0B2A5B]/30">/</span>
              <span className="text-emerald-600">{stats.downCount ?? "—"}</span>
            </span>
          }
        />
        <StatCell
          hint={stats.source}
          label="上涨占比"
          value={
            stats.upRatio === null
              ? "—"
              : `${formatMarketNumber(stats.upRatio, 1)}%`
          }
        />
        <StatCell
          hint="指数均值"
          label="指数均涨跌"
          value={
            <span className={percentTone(stats.averageChange)}>
              {stats.averageChange >= 0 ? "+" : ""}
              {formatMarketNumber(stats.averageChange)}%
            </span>
          }
        />
        <StatCell
          hint={stats.limitUp === null ? "待全市场宽度" : "全市场"}
          label="涨停 / 跌停"
          value={
            stats.limitUp === null
              ? "—"
              : `${stats.limitUp} / ${stats.limitDown}`
          }
        />
        <StatCell
          hint={stats.source}
          label="成交额"
          value={stats.turnover ?? "—"}
        />
      </div>
    </section>
  );
}

function StatCell({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: ReactNode;
}) {
  return (
    <div className="border-b border-[#0B2A5B]/8 px-4 py-3.5 sm:border-r sm:last:border-r-0 lg:border-b-0 lg:[&:nth-child(5)]:border-r-0">
      <p className="text-[11px] text-[#0B2A5B]/45">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#0B2A5B]">{value}</p>
      <p className="mt-0.5 text-[10px] text-[#0B2A5B]/35">{hint}</p>
    </div>
  );
}

function IndexGrid({ indices }: { indices: MarketIndex[] }) {
  return (
    <section>
      <SectionHeading
        eyebrow="INDEX"
        subtitle="点位、涨跌与日内波动区间"
        title="主要指数"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indices.map((index) => {
          const positive = index.change_pct >= 0;
          const amount = formatCompactAmount(index.amount);
          const marker = indexRangePosition(index);
          return (
            <div
              className="rounded-2xl border border-[#0B2A5B]/10 bg-white p-4 shadow-[0_12px_40px_rgba(11,42,91,0.04)]"
              key={index.code}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#0B2A5B]">
                    {index.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#0B2A5B]/40">
                    {index.code}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    percentChip(index.change_pct),
                  )}
                >
                  {positive ? "+" : ""}
                  {formatMarketNumber(index.change_pct)}%
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-[#0B2A5B]">
                {formatMarketNumber(index.current)}
              </p>
              <p className="mt-1 text-xs tabular-nums text-[#0B2A5B]/45">
                {positive ? "+" : ""}
                {formatMarketNumber(index.change)}
                <span className="mx-1.5">·</span>
                振幅 {formatMarketNumber(index.amplitude)}%
              </p>
              <div className="mt-4">
                <div className="relative h-1.5 rounded-full bg-[#0B2A5B]/8">
                  <div
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0B2A5B]"
                    style={{ left: `${marker}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[#0B2A5B]/40">
                  <span>低 {formatMarketNumber(index.low)}</span>
                  <span>高 {formatMarketNumber(index.high)}</span>
                </div>
              </div>
              {amount ? (
                <p className="mt-3 text-[11px] text-[#0B2A5B]/45">
                  成交额 {amount}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectorList({
  title,
  items,
  positive,
}: {
  title: string;
  items: SectorMove[];
  positive: boolean;
}) {
  const maximum = Math.max(
    ...items.map((item) => Math.abs(item.change_pct)),
    1,
  );
  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[#0B2A5B]">{title}</h3>
        <span className="text-[10px] text-[#0B2A5B]/40">涨跌幅</span>
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-xs text-[#0B2A5B]/45">
          该侧板块尚未返回
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, rank) => (
            <div key={item.name}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 font-mono text-[10px] text-[#0B2A5B]/35">
                    {String(rank + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-[#0B2A5B]/80">{item.name}</span>
                </span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    percentTone(item.change_pct),
                  )}
                >
                  {item.change_pct > 0 ? "+" : ""}
                  {formatMarketNumber(item.change_pct)}%
                </span>
              </div>
              <div className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-[#0B2A5B]/6">
                <div
                  className={cn(
                    "h-full rounded-full",
                    positive ? "bg-rose-400" : "bg-emerald-500",
                  )}
                  style={{
                    width: `${Math.max(10, (Math.abs(item.change_pct) / maximum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MarketStructure({ market }: { market: MarketReviewPayload }) {
  const topSectors = market.sectors?.top ?? [];
  const bottomSectors = market.sectors?.bottom ?? [];
  const rotation = describeSectorRotation(topSectors, bottomSectors);

  return (
    <section>
      <SectionHeading
        eyebrow="STRUCTURE"
        subtitle="观察资金从防御向进攻方向的切换"
        title="板块表现"
      />
      <div className="overflow-hidden rounded-3xl border border-[#0B2A5B]/10 bg-white shadow-[0_16px_48px_rgba(11,42,91,0.04)]">
        <p className="border-b border-[#0B2A5B]/8 bg-[#F7FBFF] px-5 py-3 text-xs leading-6 text-[#0B2A5B]/70">
          {rotation}
        </p>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-[#0B2A5B]/8">
          <SectorList items={topSectors} positive title="领涨行业" />
          <SectorList items={bottomSectors} positive={false} title="领跌行业" />
        </div>
      </div>
    </section>
  );
}

function NewsPanel({
  items,
  title = "市场资讯",
  subtitle = "DSA 汇总的最新公开信息",
  emptyText = "暂无可用资讯",
  emptyHint,
  sectionId,
}: {
  items: Array<{
    title: string;
    summary?: string;
    source: string;
    url: string;
    published_date?: string | null;
    published_at?: string | null;
    fetched_at?: string | null;
  }>;
  title?: string;
  subtitle?: string;
  emptyText?: string;
  emptyHint?: string;
  sectionId?: string;
}) {
  return (
    <section className="scroll-mt-20" id={sectionId}>
      <SectionHeading subtitle={subtitle} title={title} />
      <div className="overflow-hidden rounded-3xl border border-[#0B2A5B]/10 bg-white">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-[#0B2A5B]">{emptyText}</p>
            {emptyHint ? (
              <p className="mt-1 text-xs text-[#0B2A5B]/50">{emptyHint}</p>
            ) : null}
          </div>
        ) : null}
        <div className="divide-y divide-[#0B2A5B]/8">
          {items.slice(0, 6).map((item) => {
            const time =
              item.published_date ?? item.published_at ?? item.fetched_at ?? null;
            const href = item.url || "/workspace/news";
            const isInternal = href.startsWith("/");
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-6 text-[#0B2A5B]">
                    {item.title}
                  </span>
                  {item.summary ? (
                    <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-[#0B2A5B]/55">
                      {item.summary}
                    </span>
                  ) : null}
                  <span className="mt-2 flex items-center gap-2 text-[11px] text-[#0B2A5B]/40">
                    <span className="rounded-full bg-[#EBF2FF] px-2 py-0.5 text-[#0B2A5B]/70">
                      {item.source}
                    </span>
                    {time ? <span>{formatDateTime(time)}</span> : null}
                  </span>
                </span>
                <ExternalLinkIcon className="mt-1 size-3.5 shrink-0 text-[#0B2A5B]/25 transition-opacity group-hover:text-[#0B2A5B]/60" />
              </>
            );
            if (isInternal) {
              return (
                <Link
                  className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#F7FBFF]"
                  href={href}
                  key={`${href}-${item.title}`}
                >
                  {content}
                </Link>
              );
            }
            return (
              <a
                className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#F7FBFF]"
                href={href}
                key={`${href}-${item.title}`}
                rel="noreferrer"
                target="_blank"
              >
                {content}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ResearchPanel({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading
        subtitle="打开结论后可继续追问"
        title="最近研究"
      />
      <div className="overflow-hidden rounded-3xl border border-[#0B2A5B]/10 bg-white">
        <div className="divide-y divide-[#0B2A5B]/8">
          {items.slice(0, 4).map((item) => (
            <Link
              className="group block px-4 py-3.5 transition-colors hover:bg-[#F7FBFF]"
              href={researchHref(item.stock_code, item.stock_name, item.id)}
              key={item.id}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-[#0B2A5B]">
                  {item.stock_name ?? item.stock_code}
                  <span className="ml-2 font-mono text-[10px] font-normal text-[#0B2A5B]/40">
                    {item.stock_code}
                  </span>
                </p>
                <span className="shrink-0 text-[11px] text-[#0B2A5B]/40">
                  {item.action_label ?? item.action ?? "已分析"} ·{" "}
                  {formatDateTime(item.created_at)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#0B2A5B]/55">
                {item.analysis_summary ??
                  item.trend_prediction ??
                  "打开研究结论并继续追问"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RiskPreferenceNote() {
  const { user } = useAuth();
  const [text, setText] = useState<{ title: string; body: string } | null>(
    null,
  );

  useEffect(() => {
    if (!user?.id) return;
    const profile = readStoredRiskProfile(user.id);
    if (!profile) return;
    const conclusion = concludeRiskProfile(profile.profileId, "zh-CN");
    setText({
      title: `${conclusion.rating} ${conclusion.title}`,
      body: `现金底仓 ${Math.round(Number(conclusion.minCashWeight) * 100)}%，个股上限 ${Math.round(Number(conclusion.maxSingleWeight) * 100)}%。结合当前市场温度，优先用仓位纪律而不是追涨。`,
    });
  }, [user?.id]);

  if (!text) return null;
  return (
    <div className="rounded-2xl border border-[#0B2A5B]/10 bg-[#F7FBFF] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-[#0B2A5B]/70">
        <SparklesIcon className="size-3.5" />
        投资者偏好
      </p>
      <p className="mt-2 text-sm font-medium text-[#0B2A5B]">{text.title}</p>
      <p className="mt-1 text-xs leading-5 text-[#0B2A5B]/60">{text.body}</p>
    </div>
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
  const rising = stocks.filter(
    (stock) => (stock.quote?.change_percent ?? 0) > 0,
  ).length;
  const falling = stocks.filter(
    (stock) => (stock.quote?.change_percent ?? 0) < 0,
  ).length;

  return (
    <aside className="xl:sticky xl:top-4">
      <div className="overflow-hidden rounded-3xl border border-[#0B2A5B]/10 bg-white shadow-[0_16px_48px_rgba(11,42,91,0.05)]">
        <div className="flex items-start justify-between gap-3 border-b border-[#0B2A5B]/8 bg-[#F7FBFF] px-4 py-4">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-[#0B2A5B]/40">
              WATCH
            </p>
            <h2 className="mt-1 font-semibold text-[#0B2A5B]">关注行情</h2>
            <p className="mt-0.5 text-xs text-[#0B2A5B]/50">
              {stocks.length} 个标的 · {rising} 涨 · {falling} 跌
            </p>
          </div>
          <Button
            aria-label="刷新关注列表"
            disabled={refreshing}
            onClick={onRefresh}
            size="icon-sm"
            variant="ghost"
          >
            <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
          </Button>
        </div>
        <div className="divide-y divide-[#0B2A5B]/8">
          {stocks.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-[#0B2A5B]">还没有关注的股票</p>
              <p className="mt-1 text-xs text-[#0B2A5B]/50">
                前往完整关注列表添加标的
              </p>
            </div>
          ) : null}
          {stocks.slice(0, 8).map(({ code, quote, history }) => {
            const positive = (quote?.change_percent ?? 0) >= 0;
            const name = quote?.stock_name ?? code;
            const series = history.map((point) => point.close).filter(Number.isFinite);
            return (
              <Link
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F7FBFF]"
                href={researchHref(code, name)}
                key={code}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0B2A5B]">
                    {name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#0B2A5B]/40">
                    {code}
                  </p>
                </div>
                <Sparkline positive={positive} values={series} />
                <div className="min-w-[72px] text-right">
                  <p className="text-sm font-semibold tabular-nums text-[#0B2A5B]">
                    {formatMarketNumber(quote?.current_price)}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] font-medium tabular-nums",
                      percentTone(quote?.change_percent),
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatMarketNumber(quote?.change_percent)}%
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="p-3">
          <Button asChild className="w-full border-[#0B2A5B]/15" variant="outline">
            <Link href="/workspace/watchlist">
              打开完整关注列表 <ChevronRightIcon />
            </Link>
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <RiskPreferenceNote />
      </div>
    </aside>
  );
}

function SectionHeading({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-3">
      {eyebrow ? (
        <p className="text-[11px] tracking-[0.18em] text-[#0B2A5B]/35">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-semibold text-[#0B2A5B]">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-[#0B2A5B]/50">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function MarketWorkspace() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [
        watchlistResponse,
        marketHistory,
        recentHistory,
        intelligenceResponse,
        policyResponse,
      ] = await Promise.all([
        getJson<{ stock_codes?: string[] }>(`${DSA_API}/stocks/watchlist`),
        getJson<{ items: HistoryItem[] }>(
          `${DSA_API}/history?report_type=market_review&limit=8`,
        ),
        getJson<{ items: HistoryItem[] }>(`${DSA_API}/history?limit=10`),
        getJson<{ items: IntelligenceItem[] }>(
          `${DSA_API}/intelligence/items?market=cn&page_size=8`,
        ),
        getJson<{
          items?: Array<{
            title: string;
            summary?: string;
            source: string;
            url: string;
          }>;
        }>("/api/v1/digest-push/headlines").catch(() => ({ items: [] })),
      ]);

      const marketRecords = marketHistory.items ?? [];
      const marketDetails = await Promise.all(
        marketRecords.slice(0, 8).map((marketRecord) =>
          getJson<{
            details?: {
              context_snapshot?: {
                market_review_payload?: MarketReviewPayload;
              };
            };
          }>(`${DSA_API}/history/${marketRecord.id}`).catch(() => null),
        ),
      );
      const marketPayloads = marketDetails
        .map(
          (detail) => detail?.details?.context_snapshot?.market_review_payload,
        )
        .filter((payload): payload is MarketReviewPayload => Boolean(payload));
      const marketPayload =
        marketPayloads.find(
          (payload) =>
            payload.region === "cn" || payload.market_scope?.includes("A股"),
        ) ??
        marketPayloads[0] ??
        null;

      const codes = watchlistResponse.stock_codes ?? [];
      const stocks = await Promise.all(
        codes.map(async (code): Promise<WatchlistStock> => {
          const [quote, history] = await Promise.all([
            getJson<Quote>(
              `${DSA_API}/stocks/${encodeURIComponent(code)}/quote`,
            ).catch(() => null),
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
          (item) =>
            item.stock_code !== "MARKET" &&
            item.report_type !== "market_review",
        ),
        intelligence: intelligenceResponse.items ?? [],
        policyHeadlines: policyResponse.items ?? [],
      });
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "市场数据暂时不可用",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(
      () => void loadDashboard(true),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (!data) return;
    if (window.location.hash !== "#policy") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("policy")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [data]);

  const newsItems = useMemo(
    () =>
      data?.market?.news?.length
        ? data.market.news
        : (data?.intelligence ?? []),
    [data],
  );
  const session = aShareSessionStatus();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#F4F8FF_0%,#F8FAFC_28%,#F8FAFC_100%)]">
      <header className="shrink-0 border-b border-[#0B2A5B]/8 bg-white/80 px-4 py-3.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.18em] text-[#0B2A5B]/40">
              MARKET
            </p>
            <h1 className="text-lg font-semibold text-[#0B2A5B]">股票市场</h1>
            <p className="mt-0.5 truncate text-xs text-[#0B2A5B]/50">
              A 股行情、市场结构与研究记录 · {session.detail}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "hidden rounded-full px-2.5 py-1 text-[11px] sm:inline-flex",
                session.live
                  ? "bg-[#0B2A5B] text-white"
                  : "bg-[#EBF2FF] text-[#0B2A5B]/70",
              )}
            >
              {session.live ? "实时 " : ""}
              {session.label}
            </span>
            <Button
              disabled={refreshing}
              onClick={() => void loadDashboard()}
              size="sm"
              variant="ghost"
            >
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
              <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button asChild className="bg-[#0B2A5B] hover:bg-[#0B2A5B]/90" size="sm">
              <Link href="/workspace/chats/new?market=cn">
                <MessageSquarePlusIcon />
                研究今日市场
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7">
          {!data && !error ? <LoadingDashboard /> : null}

          {error && !data ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="max-w-md rounded-3xl border border-[#0B2A5B]/10 bg-white p-8 text-center shadow-sm">
                <GaugeIcon className="mx-auto size-7 text-[#0B2A5B]/40" />
                <h2 className="mt-4 font-semibold text-[#0B2A5B]">市场数据连接失败</h2>
                <p className="mt-2 text-sm text-[#0B2A5B]/55">{error}</p>
                <Button
                  className="mt-5"
                  onClick={() => void loadDashboard()}
                  variant="outline"
                >
                  <RefreshCwIcon />
                  重新连接
                </Button>
              </div>
            </div>
          ) : null}

          {data ? (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-7">
                {data.market ? (
                  <>
                    <MarketPulse market={data.market} />
                    {(data.market.indices?.length ?? 0) > 0 ? (
                      <IndexGrid indices={data.market.indices ?? []} />
                    ) : null}
                    <MarketStructure market={data.market} />
                    <div className="grid items-start gap-6 lg:grid-cols-2">
                      <NewsPanel
                        emptyHint="宏观与监管口径会在抓取完成后出现在这里"
                        emptyText="政策动态抓取中"
                        items={data.policyHeadlines}
                        sectionId="policy"
                        subtitle="发改委 / 财政部 / 央行等宏观与政策要点"
                        title="政策动态"
                      />
                      <NewsPanel items={newsItems} />
                    </div>
                  </>
                ) : (
                  <section className="rounded-3xl border border-[#0B2A5B]/10 bg-white px-5 py-6">
                    <h2 className="font-semibold text-[#0B2A5B]">尚无今日大盘复盘</h2>
                    <p className="mt-1 text-sm text-[#0B2A5B]/55">
                      DSA 完成市场复盘后，这里会自动展示指数、宽度和板块结构。
                    </p>
                    <div className="mt-5">
                      <NewsPanel
                        emptyHint="也可以先从资讯页查看公开来源"
                        emptyText="政策动态抓取中"
                        items={data.policyHeadlines}
                        sectionId="policy"
                        subtitle="发改委 / 财政部 / 央行等宏观与政策要点"
                        title="政策动态"
                      />
                    </div>
                  </section>
                )}

                <ResearchPanel items={data.recentResearch} />
              </div>

              <WatchlistPanel
                onRefresh={() => void loadDashboard()}
                refreshing={refreshing}
                stocks={data.watchlist}
              />
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[#0B2A5B]/8 pt-4 text-[11px] text-[#0B2A5B]/40">
            <span className="flex items-center gap-1.5">
              <Clock3Icon className="size-3" /> 数据来自 Daily Stock
              Analyze，研究由 MetaInsight 完成
            </span>
            <span>市场信息仅供研究，不构成投资建议</span>
          </div>
        </div>
      </main>
    </div>
  );
}
