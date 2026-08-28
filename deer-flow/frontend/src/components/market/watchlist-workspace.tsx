"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GaugeIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  NewspaperIcon,
  PlayCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { cn } from "@/lib/utils";

import { DsaAutoResearchPanel } from "./dsa-auto-research-panel";

const DSA_API = "/api/v1/market";
const REFRESH_INTERVAL_MS = 60_000;

interface Quote {
  stock_code: string;
  stock_name?: string | null;
  current_price: number;
  change?: number | null;
  change_percent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prev_close?: number | null;
  volume?: number | null;
  amount?: number | null;
  update_time?: string | null;
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

interface HistoryItem {
  id?: number | null;
  query_id: string;
  stock_code: string;
  stock_name?: string | null;
  report_type?: string | null;
  trend_prediction?: string | null;
  analysis_summary?: string | null;
  sentiment_score?: number | null;
  operation_advice?: string | null;
  action?: string | null;
  action_label?: string | null;
  current_price?: number | null;
  change_pct?: number | null;
  created_at?: string | null;
}

interface DecisionSignal {
  id: number;
  stock_code: string;
  stock_name?: string | null;
  market: string;
  action: string;
  action_label?: string | null;
  confidence?: number | null;
  score?: number | null;
  horizon?: string | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop_loss?: number | null;
  target_price?: number | null;
  reason?: string | null;
  risk_summary?: string | null;
  catalyst_summary?: string | null;
  data_quality_summary?: {
    level?: string;
    overall_score?: number;
    limitations?: string[];
  } | null;
  plan_quality: string;
  status: string;
  expires_at?: string | null;
  created_at?: string | null;
}

interface AnalysisTask {
  task_id: string;
  stock_code: string;
  stock_name?: string | null;
  status: string;
  progress: number;
  message?: string | null;
  created_at?: string | null;
}

interface IntelligenceItem {
  id: number;
  title: string;
  summary?: string | null;
  url: string;
  source: string;
  published_at?: string | null;
  fetched_at?: string | null;
}

interface ParsedStockItem {
  code?: string | null;
  name?: string | null;
}

interface WatchlistRow {
  code: string;
  quote: Quote | null;
  history: KLinePoint[];
  research: HistoryItem | null;
  signal: DecisionSignal | null;
  task: AnalysisTask | null;
  news: IntelligenceItem[];
}

interface WatchlistData {
  rows: WatchlistRow[];
  intelligence: IntelligenceItem[];
  loadedAt: string;
}

type FilterKey = "all" | "up" | "down" | "signal" | "running" | "stale";
type SortKey = "watchlist" | "change-desc" | "change-asc" | "name" | "signal";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, {
    cache: "no-store",
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string | { message?: string };
      message?: string;
    } | null;
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : (payload?.detail?.message ?? payload?.message);
    throw new Error(detail ?? `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

function stockKey(value: string) {
  const upper = value.trim().toUpperCase();
  const hkMatch = /^(?:HK)?(\d{1,5})(?:\.HK)?$/.exec(upper);
  const hkDigits = hkMatch?.[1];
  if (
    hkDigits &&
    (upper.startsWith("HK") || upper.endsWith(".HK") || hkDigits.length === 5)
  ) {
    return `HK${hkDigits.padStart(5, "0")}`;
  }
  return upper.replace(/\.(?:SH|SS|SZ|BJ)$/, "").replace(/^(?:SH|SZ|BJ)/, "");
}

function looksLikeStockCode(value: string) {
  return /^(?:\d{5,6}|(?:SH|SZ|BJ|HK)\d{1,6}|\d{1,6}\.(?:SH|SZ|SS|BJ|HK)|[A-Z]{1,5}(?:\.(?:US|[A-Z]))?)$/i.test(
    value.trim(),
  );
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatCompactAmount(value: number | null | undefined) {
  if (!value) return "—";
  if (value >= 100_000_000) return `${formatNumber(value / 100_000_000, 1)} 亿`;
  if (value >= 10_000) return `${formatNumber(value / 10_000, 1)} 万`;
  return formatNumber(value, 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "尚未更新";
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

function isResearchStale(item: HistoryItem | null) {
  if (!item?.created_at) return true;
  const timestamp = new Date(item.created_at).getTime();
  return (
    Number.isNaN(timestamp) || Date.now() - timestamp > 36 * 60 * 60 * 1000
  );
}

function percentTone(value: number | null | undefined) {
  if (!value) return "text-muted-foreground";
  return value > 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400";
}

function actionTone(action: string | null | undefined) {
  if (["buy", "add"].includes(action ?? "")) {
    return "text-rose-600 dark:text-rose-400";
  }
  if (["sell", "reduce", "avoid", "alert"].includes(action ?? "")) {
    return "text-amber-700 dark:text-amber-300";
  }
  return "text-sky-700 dark:text-sky-300";
}

function dataQualityLabel(signal: DecisionSignal | null) {
  const level = signal?.data_quality_summary?.level;
  if (level === "good" || level === "high") return "数据完整";
  if (level === "limited") return "数据受限";
  if (level === "poor" || level === "low") return "数据不足";
  return signal ? "已核对" : "暂无信号";
}

function singleResearchHref(row: WatchlistRow) {
  const params = new URLSearchParams({ stock: row.code });
  if (row.quote?.stock_name) params.set("name", row.quote.stock_name);
  if (row.research?.id) params.set("recordId", String(row.research.id));
  return `/workspace/chats/new?${params.toString()}`;
}

function batchResearchHref(rows: WatchlistRow[]) {
  const params = new URLSearchParams({
    symbols: rows.map((row) => row.code).join(","),
    names: rows.map((row) => row.quote?.stock_name ?? row.code).join(","),
  });
  return `/workspace/chats/new?${params.toString()}`;
}

function MiniTrend({
  history,
  positive,
}: {
  history: KLinePoint[];
  positive: boolean;
}) {
  const values = history.slice(-24).map((point) => point.close);
  if (values.length < 2)
    return <div className="h-9 w-28 border-b border-dashed" />;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 112;
      const y = 31 - ((value - minimum) / range) * 26;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      className={cn(
        "h-9 w-28",
        positive ? "text-rose-500" : "text-emerald-500",
      )}
      preserveAspectRatio="none"
      viewBox="0 0 112 36"
    >
      <line className="stroke-border" x1="0" x2="112" y1="31" y2="31" />
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LoadingWorkspace() {
  return (
    <div className="space-y-5">
      <div className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="border-b p-4 sm:border-r xl:border-b-0" key={index}>
            <Skeleton className="h-12 rounded-sm" />
          </div>
        ))}
      </div>
      <Skeleton className="h-36 rounded-sm" />
      <Skeleton className="h-[520px] rounded-sm" />
    </div>
  );
}

function WatchlistSummary({ rows }: { rows: WatchlistRow[] }) {
  const quoted = rows.filter((row) => row.quote);
  const rising = quoted.filter(
    (row) => (row.quote?.change_percent ?? 0) > 0,
  ).length;
  const falling = quoted.filter(
    (row) => (row.quote?.change_percent ?? 0) < 0,
  ).length;
  const average = quoted.length
    ? quoted.reduce((sum, row) => sum + (row.quote?.change_percent ?? 0), 0) /
      quoted.length
    : 0;
  const activeSignals = rows.filter(
    (row) => row.signal?.status === "active",
  ).length;
  const stale = rows.filter((row) => isResearchStale(row.research)).length;
  const running = rows.filter((row) => row.task).length;

  const metrics = [
    {
      label: "关注标的",
      value: String(rows.length),
      detail: `${rising} 涨 · ${falling} 跌`,
    },
    {
      label: "平均涨跌",
      value: `${average > 0 ? "+" : ""}${formatNumber(average)}%`,
      detail: quoted.length
        ? `${quoted.length} 只已有实时行情`
        : "行情正在加载",
      tone: percentTone(average),
    },
    {
      label: "有效 DSA 信号",
      value: String(activeSignals),
      detail: "含动作、目标价与止损",
    },
    {
      label: "研究待办",
      value: running ? `${running} 进行中` : String(stale),
      detail: running ? "DSA 正在生成结论" : `${stale} 只超过 36 小时未研究`,
    },
  ];

  return (
    <div className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          className={cn(
            "flex items-end justify-between gap-4 border-b px-4 py-3 sm:border-r xl:border-b-0",
            index === metrics.length - 1 && "sm:border-r-0",
          )}
          key={metric.label}
        >
          <div>
            <p className="text-muted-foreground text-[11px]">{metric.label}</p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {metric.detail}
            </p>
          </div>
          <p
            className={cn(
              "text-lg font-semibold tracking-tight tabular-nums",
              metric.tone,
            )}
          >
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function SignalSummary({ signal }: { signal: DecisionSignal | null }) {
  if (!signal) {
    return (
      <div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <span className="bg-muted-foreground/40 size-1.5 rounded-full" />
          暂无信号
        </p>
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          等待 DSA 分析
        </p>
      </div>
    );
  }
  const confidence = signal.confidence == null ? null : signal.confidence * 100;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn("text-xs font-semibold", actionTone(signal.action))}
        >
          {signal.action_label ?? signal.action}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground text-[11px]">
          {signal.horizon ?? "短期"}
        </span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-[11px]">
        {confidence == null
          ? dataQualityLabel(signal)
          : `置信度 ${formatNumber(confidence, 0)}%`}
      </p>
    </div>
  );
}

function ExpandedDetails({ row }: { row: WatchlistRow }) {
  const signal = row.signal;
  const qualityScore = signal?.data_quality_summary?.overall_score;
  return (
    <div className="bg-muted/10 grid lg:grid-cols-3 lg:divide-x">
      <section className="p-4">
        <p className="text-xs font-semibold">最近研究结论</p>
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          {row.research?.analysis_summary ??
            row.research?.trend_prediction ??
            "还没有该标的的 DSA 研究结论。"}
        </p>
        {row.research?.operation_advice ? (
          <p className="mt-2 line-clamp-3 text-xs leading-5">
            {row.research.operation_advice}
          </p>
        ) : null}
      </section>

      <section className="border-t p-4 lg:border-t-0">
        <p className="text-xs font-semibold">决策计划</p>
        {signal ? (
          <>
            <dl className="mt-2 grid grid-cols-3 divide-x border-y py-2">
              <div className="px-2 first:pl-0">
                <dt className="text-muted-foreground text-[10px]">参考介入</dt>
                <dd className="mt-1 text-xs font-medium tabular-nums">
                  {formatNumber(signal.entry_low)}
                </dd>
              </div>
              <div className="px-2">
                <dt className="text-muted-foreground text-[10px]">目标价</dt>
                <dd className="mt-1 text-xs font-medium tabular-nums">
                  {formatNumber(signal.target_price)}
                </dd>
              </div>
              <div className="px-2">
                <dt className="text-muted-foreground text-[10px]">止损价</dt>
                <dd className="mt-1 text-xs font-medium tabular-nums">
                  {formatNumber(signal.stop_loss)}
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs leading-5">
              {signal.reason ??
                signal.risk_summary ??
                "DSA 暂未给出详细信号理由。"}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            暂无可用决策信号。
          </p>
        )}
      </section>

      <section className="border-t p-4 lg:border-t-0">
        <p className="text-xs font-semibold">数据与资讯</p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">
            {dataQualityLabel(signal)}
          </span>
          {qualityScore != null ? <span>{qualityScore}/100</span> : null}
        </div>
        <div className="mt-3 space-y-2">
          {row.news.length ? (
            row.news.slice(0, 3).map((item) => (
              <a
                className="text-muted-foreground hover:text-foreground line-clamp-1 block text-xs"
                href={item.url}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                · {item.title}
              </a>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">
              当前资讯池暂无直接匹配内容。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function WatchlistWorkspace() {
  const [data, setData] = useState<WatchlistData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("watchlist");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadWatchlist = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const [
        watchlist,
        historyResponse,
        signalResponse,
        taskResponse,
        intelligenceResponse,
      ] = await Promise.all([
        getJson<{ stock_codes?: string[] }>(`${DSA_API}/stocks/watchlist`),
        getJson<{ items?: HistoryItem[] }>(
          `${DSA_API}/history?limit=100`,
        ).catch(() => ({ items: [] })),
        getJson<{ items?: DecisionSignal[] }>(
          `${DSA_API}/decision-signals?status=active&page_size=100`,
        ).catch(() => ({ items: [] })),
        getJson<{ tasks?: AnalysisTask[] }>(
          `${DSA_API}/analysis/tasks?limit=100`,
        ).catch(() => ({ tasks: [] })),
        getJson<{ items?: IntelligenceItem[] }>(
          `${DSA_API}/intelligence/items?page_size=100`,
        ).catch(() => ({ items: [] })),
      ]);

      const histories = historyResponse.items ?? [];
      const signals = signalResponse.items ?? [];
      const tasks = taskResponse.tasks ?? [];
      const intelligence = intelligenceResponse.items ?? [];
      const codes = watchlist.stock_codes ?? [];

      const rows = await Promise.all(
        codes.map(async (code): Promise<WatchlistRow> => {
          const [quote, history] = await Promise.all([
            getJson<Quote>(
              `${DSA_API}/stocks/${encodeURIComponent(code)}/quote`,
            ).catch(() => null),
            getJson<{ data?: KLinePoint[] }>(
              `${DSA_API}/stocks/${encodeURIComponent(code)}/history?period=daily&days=60`,
            ).catch(() => ({ data: [] })),
          ]);
          const key = stockKey(code);
          const research =
            histories.find((item) => stockKey(item.stock_code) === key) ?? null;
          const signal =
            signals.find((item) => stockKey(item.stock_code) === key) ?? null;
          const task =
            tasks.find(
              (item) =>
                stockKey(item.stock_code) === key &&
                ["pending", "processing", "cancel_requested"].includes(
                  item.status,
                ),
            ) ?? null;
          const terms = [quote?.stock_name, research?.stock_name, code]
            .filter((item): item is string => Boolean(item))
            .map((item) => item.toLowerCase());
          const relatedNews = intelligence.filter((item) => {
            const haystack =
              `${item.title} ${item.summary ?? ""}`.toLowerCase();
            return terms.some(
              (term) => term.length > 2 && haystack.includes(term),
            );
          });
          return {
            code,
            quote,
            history: history.data ?? [],
            research,
            signal,
            task,
            news: relatedNews,
          };
        }),
      );

      setData({ rows, intelligence, loadedAt: new Date().toISOString() });
      setSelected(
        (current) =>
          new Set([...current].filter((code) => codes.includes(code))),
      );
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "关注列表暂时不可用",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
    const timer = window.setInterval(
      () => void loadWatchlist(true),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [loadWatchlist]);

  const filteredRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const base = (data?.rows ?? []).filter((row) => {
      const matchesText =
        !text ||
        row.code.toLowerCase().includes(text) ||
        row.quote?.stock_name?.toLowerCase().includes(text);
      if (!matchesText) return false;
      const change = row.quote?.change_percent ?? 0;
      if (filter === "up") return change > 0;
      if (filter === "down") return change < 0;
      if (filter === "signal") return Boolean(row.signal);
      if (filter === "running") return Boolean(row.task);
      if (filter === "stale") return isResearchStale(row.research);
      return true;
    });
    return [...base].sort((left, right) => {
      if (sort === "change-desc")
        return (
          (right.quote?.change_percent ?? -Infinity) -
          (left.quote?.change_percent ?? -Infinity)
        );
      if (sort === "change-asc")
        return (
          (left.quote?.change_percent ?? Infinity) -
          (right.quote?.change_percent ?? Infinity)
        );
      if (sort === "name")
        return (left.quote?.stock_name ?? left.code).localeCompare(
          right.quote?.stock_name ?? right.code,
          "zh-CN",
        );
      if (sort === "signal")
        return Number(Boolean(right.signal)) - Number(Boolean(left.signal));
      return (data?.rows.indexOf(left) ?? 0) - (data?.rows.indexOf(right) ?? 0);
    });
  }, [data, filter, query, sort]);

  const selectedRows = useMemo(
    () => (data?.rows ?? []).filter((row) => selected.has(row.code)),
    [data, selected],
  );

  const addStock = useCallback(async () => {
    const raw = addQuery.trim();
    if (!raw) return;
    setBusyAction("add");
    try {
      let code = raw;
      let name: string | null = null;
      if (!looksLikeStockCode(raw)) {
        const parsed = await getJson<{ items?: ParsedStockItem[] }>(
          `${DSA_API}/stocks/parse-import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: raw }),
          },
        );
        const match = parsed.items?.find((item) => item.code);
        if (!match?.code)
          throw new Error(`没有识别到“${raw}”，请尝试完整股票名称或代码`);
        code = match.code;
        name = match.name ?? null;
      }
      await getJson(`${DSA_API}/stocks/watchlist/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_code: code }),
      });
      toast.success(`已加入 ${name ? `${name} · ` : ""}${code}`);
      setAddQuery("");
      await loadWatchlist(true);
    } catch (addError) {
      toast.error(
        addError instanceof Error ? addError.message : "加入关注失败",
      );
    } finally {
      setBusyAction(null);
    }
  }, [addQuery, loadWatchlist]);

  const removeStocks = useCallback(
    async (codes: string[]) => {
      if (!codes.length) return;
      setBusyAction("remove");
      try {
        await Promise.all(
          codes.map((code) =>
            getJson(`${DSA_API}/stocks/watchlist/remove`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stock_code: code }),
            }),
          ),
        );
        toast.success(`已移出 ${codes.length} 个标的`);
        setSelected(new Set());
        await loadWatchlist(true);
      } catch (removeError) {
        toast.error(
          removeError instanceof Error ? removeError.message : "移出关注失败",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [loadWatchlist],
  );

  const runAnalysis = useCallback(
    async (codes: string[]) => {
      if (!codes.length) return;
      setBusyAction("analyze");
      try {
        await getJson(`${DSA_API}/analysis/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stock_codes: codes,
            report_type: "detailed",
            force_refresh: true,
            async_mode: true,
            analysis_phase: "auto",
            selection_source: "manual",
            notify: false,
            report_language: "zh",
          }),
        });
        toast.success(`已提交 ${codes.length} 个 DSA 分析任务`);
        window.setTimeout(() => void loadWatchlist(true), 1200);
      } catch (analysisError) {
        toast.error(
          analysisError instanceof Error
            ? analysisError.message
            : "提交分析失败",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [loadWatchlist],
  );

  const toggleSelected = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.code));
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected)
        filteredRows.forEach((row) => next.delete(row.code));
      else filteredRows.forEach((row) => next.add(row.code));
      return next;
    });
  };

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "全部" },
    { key: "up", label: "上涨" },
    { key: "down", label: "下跌" },
    { key: "signal", label: "有信号" },
    { key: "running", label: "分析中" },
    { key: "stale", label: "待更新" },
  ];

  return (
    <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
      <header className="bg-background shrink-0 border-b px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">关注列表</h1>
            <p className="text-muted-foreground mt-0.5 text-xs">
              行情监测与收盘研究
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <DsaAutoResearchPanel
              stocks={(data?.rows ?? []).map((row) => ({
                symbol: row.code,
                name: row.quote?.stock_name ?? row.research?.stock_name,
              }))}
            />
            <form
              className="flex min-w-0 flex-1 gap-2 sm:min-w-[360px]"
              onSubmit={(event) => {
                event.preventDefault();
                void addStock();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                <Input
                  aria-label="添加股票名称或代码"
                  className="h-9 pl-9"
                  onChange={(event) => setAddQuery(event.target.value)}
                  placeholder="添加名称或代码，如 贵州茅台"
                  value={addQuery}
                />
              </div>
              <Button
                disabled={!addQuery.trim() || busyAction === "add"}
                size="sm"
                type="submit"
              >
                {busyAction === "add" ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <PlusIcon />
                )}
                添加
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-6">
          {!data && !error ? <LoadingWorkspace /> : null}

          {error && !data ? (
            <div className="flex min-h-[460px] items-center justify-center">
              <div className="max-w-md border-y p-8 text-center">
                <GaugeIcon className="text-muted-foreground mx-auto size-7" />
                <h2 className="mt-4 font-semibold">关注数据连接失败</h2>
                <p className="text-muted-foreground mt-2 text-sm">{error}</p>
                <Button
                  className="mt-5"
                  onClick={() => void loadWatchlist()}
                  variant="outline"
                >
                  <RefreshCwIcon />
                  重新连接
                </Button>
              </div>
            </div>
          ) : null}

          {data ? (
            <>
              <WatchlistSummary rows={data.rows} />

              <div className="flex flex-col gap-3 border-y px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative sm:w-60">
                    <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                    <Input
                      aria-label="筛选关注列表"
                      className="h-8 pl-9"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="筛选名称或代码"
                      value={query}
                    />
                  </div>
                  <div className="flex gap-3 overflow-x-auto">
                    {filters.map((item) => (
                      <button
                        className={cn(
                          "h-8 shrink-0 border-b-2 px-0.5 text-xs transition-colors",
                          filter === item.key
                            ? "border-foreground text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground border-transparent",
                        )}
                        key={item.key}
                        onClick={() => setFilter(item.key)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="关注列表排序"
                    className="bg-background focus:border-foreground h-8 border px-2 text-xs outline-none"
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    value={sort}
                  >
                    <option value="watchlist">关注顺序</option>
                    <option value="change-desc">涨幅从高到低</option>
                    <option value="change-asc">跌幅从低到高</option>
                    <option value="name">按名称排序</option>
                    <option value="signal">有信号优先</option>
                  </select>
                  <Button
                    disabled={refreshing}
                    onClick={() => void loadWatchlist()}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCwIcon
                      className={cn(refreshing && "animate-spin")}
                    />
                    刷新
                  </Button>
                </div>
              </div>

              {selectedRows.length ? (
                <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-y px-4 py-2.5 backdrop-blur">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckIcon className="size-3.5" />
                    已选择 {selectedRows.length} 个标的
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={batchResearchHref(selectedRows)}>
                        <MessageSquarePlusIcon />在 MetaInsight 研究
                      </Link>
                    </Button>
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void runAnalysis(selectedRows.map((row) => row.code))
                      }
                      size="sm"
                      variant="outline"
                    >
                      {busyAction === "analyze" ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <PlayCircleIcon />
                      )}
                      DSA 重新分析
                    </Button>
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        void removeStocks(selectedRows.map((row) => row.code))
                      }
                      size="sm"
                      variant="ghost"
                    >
                      {busyAction === "remove" ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <Trash2Icon />
                      )}
                      移出关注
                    </Button>
                  </div>
                </div>
              ) : null}

              <section className="bg-background overflow-hidden border-y">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">研究队列</h2>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {filteredRows.length} 个标的 · 行情每分钟自动刷新
                    </p>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    更新于 {formatDateTime(data.loadedAt)}
                  </span>
                </div>

                {filteredRows.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <StarIcon className="text-muted-foreground mx-auto size-7" />
                    <p className="mt-3 text-sm font-medium">
                      没有符合条件的标的
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      调整筛选条件，或在页面顶部添加股票。
                    </p>
                  </div>
                ) : null}

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1120px] border-collapse text-left">
                    <thead className="bg-muted/35 text-muted-foreground text-[11px]">
                      <tr>
                        <th className="w-11 px-4 py-3 font-medium">
                          <input
                            aria-label="选择当前全部标的"
                            checked={allVisibleSelected}
                            className="accent-primary size-3.5"
                            onChange={toggleAllVisible}
                            type="checkbox"
                          />
                        </th>
                        <th className="px-3 py-3 font-medium">标的</th>
                        <th className="px-3 py-3 font-medium">实时行情</th>
                        <th className="px-3 py-3 font-medium">60 日走势</th>
                        <th className="px-3 py-3 font-medium">DSA 信号</th>
                        <th className="px-3 py-3 font-medium">最近研究</th>
                        <th className="px-4 py-3 text-right font-medium">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredRows.map((row) => {
                        const change = row.quote?.change_percent ?? 0;
                        const positive = change >= 0;
                        const expanded = expandedCode === row.code;
                        return (
                          <Fragment key={row.code}>
                            <tr className="hover:bg-muted/20 align-top transition-colors">
                              <td className="px-4 py-4">
                                <input
                                  aria-label={`选择 ${row.quote?.stock_name ?? row.code}`}
                                  checked={selected.has(row.code)}
                                  className="accent-primary size-3.5"
                                  onChange={() => toggleSelected(row.code)}
                                  type="checkbox"
                                />
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-medium">
                                  {row.quote?.stock_name ??
                                    row.research?.stock_name ??
                                    row.code}
                                </p>
                                <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                                  {row.code}
                                </p>
                                {row.task ? (
                                  <span className="text-muted-foreground mt-2 flex items-center gap-1 text-[10px]">
                                    <Loader2Icon className="animate-spin" />
                                    分析中 {row.task.progress}%
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-4">
                                <p className="font-semibold tabular-nums">
                                  {formatNumber(row.quote?.current_price)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1 text-xs font-medium tabular-nums",
                                    percentTone(change),
                                  )}
                                >
                                  {positive ? "+" : ""}
                                  {formatNumber(change)}%
                                </p>
                                <p className="text-muted-foreground mt-1 text-[10px]">
                                  额 {formatCompactAmount(row.quote?.amount)}
                                </p>
                              </td>
                              <td className="px-3 py-4">
                                <MiniTrend
                                  history={row.history}
                                  positive={positive}
                                />
                                <p className="text-muted-foreground mt-1.5 text-[10px]">
                                  高 {formatNumber(row.quote?.high)} · 低{" "}
                                  {formatNumber(row.quote?.low)}
                                </p>
                              </td>
                              <td className="px-3 py-4">
                                <SignalSummary signal={row.signal} />
                              </td>
                              <td className="max-w-[260px] px-3 py-4">
                                {row.research ? (
                                  <>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] font-medium">
                                        {row.research.action_label ??
                                          row.research.action ??
                                          "已分析"}
                                      </span>
                                      <span className="text-muted-foreground">
                                        ·
                                      </span>
                                      <span className="text-muted-foreground text-[10px]">
                                        {formatDateTime(
                                          row.research.created_at,
                                        )}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-5">
                                      {row.research.analysis_summary ??
                                        row.research.trend_prediction}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    尚无研究记录
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex justify-end gap-1.5">
                                  <Button asChild size="sm" variant="ghost">
                                    <Link href={singleResearchHref(row)}>
                                      <MessageSquarePlusIcon />
                                      研究
                                    </Link>
                                  </Button>
                                  <Button
                                    aria-label={`DSA 分析 ${row.quote?.stock_name ?? row.code}`}
                                    disabled={
                                      Boolean(busyAction) || Boolean(row.task)
                                    }
                                    onClick={() => void runAnalysis([row.code])}
                                    size="icon-sm"
                                    variant="ghost"
                                  >
                                    <PlayCircleIcon />
                                  </Button>
                                  <Button
                                    aria-label={
                                      expanded ? "收起详情" : "展开详情"
                                    }
                                    onClick={() =>
                                      setExpandedCode(
                                        expanded ? null : row.code,
                                      )
                                    }
                                    size="icon-sm"
                                    variant="ghost"
                                  >
                                    {expanded ? (
                                      <ChevronUpIcon />
                                    ) : (
                                      <ChevronDownIcon />
                                    )}
                                  </Button>
                                  <Button
                                    aria-label={`移除 ${row.quote?.stock_name ?? row.code}`}
                                    disabled={Boolean(busyAction)}
                                    onClick={() =>
                                      void removeStocks([row.code])
                                    }
                                    size="icon-sm"
                                    variant="ghost"
                                  >
                                    <Trash2Icon />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr>
                                <td className="border-t p-0" colSpan={7}>
                                  <ExpandedDetails row={row} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y md:hidden">
                  {filteredRows.map((row) => {
                    const change = row.quote?.change_percent ?? 0;
                    const positive = change >= 0;
                    const expanded = expandedCode === row.code;
                    return (
                      <div className="p-4" key={row.code}>
                        <div className="flex items-start gap-3">
                          <input
                            aria-label={`选择 ${row.quote?.stock_name ?? row.code}`}
                            checked={selected.has(row.code)}
                            className="accent-primary mt-1 size-3.5"
                            onChange={() => toggleSelected(row.code)}
                            type="checkbox"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">
                                  {row.quote?.stock_name ?? row.code}
                                </p>
                                <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                                  {row.code}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold tabular-nums">
                                  {formatNumber(row.quote?.current_price)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1 text-xs font-medium",
                                    percentTone(change),
                                  )}
                                >
                                  {positive ? "+" : ""}
                                  {formatNumber(change)}%
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
                              <MiniTrend
                                history={row.history}
                                positive={positive}
                              />
                              <SignalSummary signal={row.signal} />
                            </div>
                            <div className="mt-4 flex gap-2 border-t pt-3">
                              <Button
                                asChild
                                className="flex-1"
                                size="sm"
                                variant="secondary"
                              >
                                <Link href={singleResearchHref(row)}>
                                  <MessageSquarePlusIcon />
                                  研究
                                </Link>
                              </Button>
                              <Button
                                disabled={
                                  Boolean(busyAction) || Boolean(row.task)
                                }
                                onClick={() => void runAnalysis([row.code])}
                                size="icon-sm"
                                variant="outline"
                              >
                                <PlayCircleIcon />
                              </Button>
                              <Button
                                onClick={() =>
                                  setExpandedCode(expanded ? null : row.code)
                                }
                                size="icon-sm"
                                variant="ghost"
                              >
                                {expanded ? (
                                  <ChevronUpIcon />
                                ) : (
                                  <ChevronDownIcon />
                                )}
                              </Button>
                              <Button
                                onClick={() => void removeStocks([row.code])}
                                size="icon-sm"
                                variant="ghost"
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                            {expanded ? (
                              <div className="mt-4 border-y">
                                <ExpandedDetails row={row} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <NewspaperIcon className="size-3" /> DSA 已连接{" "}
                  {data.intelligence.length} 条近期资讯
                </span>
                <span>决策信号用于研究辅助，不构成投资建议</span>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
