"use client";

import {
  ActivityIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Clock3Icon,
  GaugeIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  NewspaperIcon,
  PlayCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StarIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DSA_API = "/market-api/api/v1";
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
  const response = await globalThis.fetch(path, {
    cache: "no-store",
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string | { message?: string }; message?: string }
      | null;
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : payload?.detail?.message || payload?.message;
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

function stockKey(value: string) {
  const upper = value.trim().toUpperCase();
  const hkMatch = upper.match(/^(?:HK)?(\d{1,5})(?:\.HK)?$/);
  const hkDigits = hkMatch?.[1];
  if (hkDigits && (upper.startsWith("HK") || upper.endsWith(".HK") || hkDigits.length === 5)) {
    return `HK${hkDigits.padStart(5, "0")}`;
  }
  return upper
    .replace(/\.(?:SH|SS|SZ|BJ)$/, "")
    .replace(/^(?:SH|SZ|BJ)/, "");
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
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+08:00`;
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
  return Number.isNaN(timestamp) || Date.now() - timestamp > 36 * 60 * 60 * 1000;
}

function percentTone(value: number | null | undefined) {
  if (!value) return "text-muted-foreground";
  return value > 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400";
}

function actionTone(action: string | null | undefined) {
  if (["buy", "add"].includes(action ?? "")) {
    return "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  }
  if (["sell", "reduce", "avoid", "alert"].includes(action ?? "")) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
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
    names: rows.map((row) => row.quote?.stock_name || row.code).join(","),
  });
  return `/workspace/chats/new?${params.toString()}`;
}

function MiniTrend({ history, positive }: { history: KLinePoint[]; positive: boolean }) {
  const values = history.slice(-24).map((point) => point.close);
  if (values.length < 2) return <div className="h-9 w-28 rounded-md bg-muted/60" />;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  return (
    <div className="flex h-9 w-28 items-end gap-px overflow-hidden" aria-hidden>
      {values.map((value, index) => (
        <span
          className={cn(
            "min-w-0 flex-1 rounded-[1px] opacity-80",
            positive ? "bg-rose-400" : "bg-emerald-500",
          )}
          key={`${index}-${value}`}
          style={{ height: `${20 + ((value - minimum) / range) * 80}%` }}
        />
      ))}
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-28 rounded-xl" key={index} />
        ))}
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  );
}

function SummaryCards({ rows }: { rows: WatchlistRow[] }) {
  const quoted = rows.filter((row) => row.quote);
  const rising = quoted.filter((row) => (row.quote?.change_percent ?? 0) > 0).length;
  const falling = quoted.filter((row) => (row.quote?.change_percent ?? 0) < 0).length;
  const average = quoted.length
    ? quoted.reduce((sum, row) => sum + (row.quote?.change_percent ?? 0), 0) / quoted.length
    : 0;
  const activeSignals = rows.filter((row) => row.signal?.status === "active").length;
  const stale = rows.filter((row) => isResearchStale(row.research)).length;
  const running = rows.filter((row) => row.task).length;

  const cards = [
    {
      label: "关注标的",
      value: String(rows.length),
      detail: `${rising} 涨 · ${falling} 跌`,
      icon: StarIcon,
    },
    {
      label: "平均涨跌",
      value: `${average > 0 ? "+" : ""}${formatNumber(average)}%`,
      detail: quoted.length ? `${quoted.length} 只已有实时行情` : "行情正在加载",
      icon: average >= 0 ? ArrowUpRightIcon : ArrowDownRightIcon,
      tone: percentTone(average),
    },
    {
      label: "有效 DSA 信号",
      value: String(activeSignals),
      detail: "含动作、目标价与止损",
      icon: TargetIcon,
    },
    {
      label: "研究待办",
      value: running ? `${running} 进行中` : String(stale),
      detail: running ? "DSA 正在生成结论" : `${stale} 只超过 36 小时未研究`,
      icon: running ? ActivityIcon : Clock3Icon,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card className="gap-0 py-0 shadow-none" key={card.label}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", card.tone)}>{card.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.detail}</p>
            </div>
            <span className="rounded-xl bg-muted p-2.5 text-muted-foreground">
              <card.icon className="size-5" />
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SignalSummary({ signal }: { signal: DecisionSignal | null }) {
  if (!signal) {
    return (
      <div>
        <Badge variant="outline">暂无信号</Badge>
        <p className="mt-1.5 text-[11px] text-muted-foreground">运行一次 DSA 分析后生成</p>
      </div>
    );
  }
  const confidence = signal.confidence == null ? null : signal.confidence * 100;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={actionTone(signal.action)} variant="outline">
          {signal.action_label || signal.action}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{signal.horizon || "短期"}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {confidence == null ? dataQualityLabel(signal) : `置信度 ${formatNumber(confidence, 0)}%`}
      </p>
    </div>
  );
}

function ExpandedDetails({ row }: { row: WatchlistRow }) {
  const signal = row.signal;
  const qualityScore = signal?.data_quality_summary?.overall_score;
  return (
    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <SparklesIcon className="size-3.5" /> 最近研究结论
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {row.research?.analysis_summary || row.research?.trend_prediction || "还没有该标的的 DSA 研究结论。"}
        </p>
        {row.research?.operation_advice ? (
          <p className="mt-2 line-clamp-3 text-xs leading-5">{row.research.operation_advice}</p>
        ) : null}
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <TargetIcon className="size-3.5" /> 决策计划
        </p>
        {signal ? (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">参考介入</p>
                <p className="mt-1 text-xs font-medium tabular-nums">{formatNumber(signal.entry_low)}</p>
              </div>
              <div className="rounded-lg border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">目标价</p>
                <p className="mt-1 text-xs font-medium tabular-nums">{formatNumber(signal.target_price)}</p>
              </div>
              <div className="rounded-lg border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">止损价</p>
                <p className="mt-1 text-xs font-medium tabular-nums">{formatNumber(signal.stop_loss)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {signal.reason || signal.risk_summary || "DSA 暂未给出详细信号理由。"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">暂无可用决策信号。</p>
        )}
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <ShieldAlertIcon className="size-3.5" /> 数据质量与资讯
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline">{dataQualityLabel(signal)}</Badge>
          {qualityScore != null ? (
            <div className="min-w-0 flex-1">
              <Progress className="h-1.5" value={qualityScore} />
            </div>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {row.news.length ? (
            row.news.slice(0, 3).map((item) => (
              <a
                className="block line-clamp-1 text-xs text-muted-foreground hover:text-foreground"
                href={item.url}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                · {item.title}
              </a>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">当前资讯池暂无直接匹配内容。</p>
          )}
        </div>
      </div>
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
      const [watchlist, historyResponse, signalResponse, taskResponse, intelligenceResponse] =
        await Promise.all([
          getJson<{ stock_codes?: string[] }>(`${DSA_API}/stocks/watchlist`),
          getJson<{ items?: HistoryItem[] }>(`${DSA_API}/history?limit=100`).catch(() => ({ items: [] })),
          getJson<{ items?: DecisionSignal[] }>(`${DSA_API}/decision-signals?status=active&page_size=100`).catch(
            () => ({ items: [] }),
          ),
          getJson<{ tasks?: AnalysisTask[] }>(`${DSA_API}/analysis/tasks?limit=100`).catch(() => ({ tasks: [] })),
          getJson<{ items?: IntelligenceItem[] }>(`${DSA_API}/intelligence/items?page_size=100`).catch(
            () => ({ items: [] }),
          ),
        ]);

      const histories = historyResponse.items ?? [];
      const signals = signalResponse.items ?? [];
      const tasks = taskResponse.tasks ?? [];
      const intelligence = intelligenceResponse.items ?? [];
      const codes = watchlist.stock_codes ?? [];

      const rows = await Promise.all(
        codes.map(async (code): Promise<WatchlistRow> => {
          const [quote, history] = await Promise.all([
            getJson<Quote>(`${DSA_API}/stocks/${encodeURIComponent(code)}/quote`).catch(() => null),
            getJson<{ data?: KLinePoint[] }>(
              `${DSA_API}/stocks/${encodeURIComponent(code)}/history?period=daily&days=60`,
            ).catch(() => ({ data: [] })),
          ]);
          const key = stockKey(code);
          const research = histories.find((item) => stockKey(item.stock_code) === key) ?? null;
          const signal = signals.find((item) => stockKey(item.stock_code) === key) ?? null;
          const task =
            tasks.find(
              (item) =>
                stockKey(item.stock_code) === key && ["pending", "processing", "cancel_requested"].includes(item.status),
            ) ?? null;
          const terms = [quote?.stock_name, research?.stock_name, code]
            .filter((item): item is string => Boolean(item))
            .map((item) => item.toLowerCase());
          const relatedNews = intelligence.filter((item) => {
            const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
            return terms.some((term) => term.length > 2 && haystack.includes(term));
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
      setSelected((current) => new Set([...current].filter((code) => codes.includes(code))));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "关注列表暂时不可用");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWatchlist();
    const timer = window.setInterval(() => void loadWatchlist(true), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadWatchlist]);

  const filteredRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const base = (data?.rows ?? []).filter((row) => {
      const matchesText =
        !text || row.code.toLowerCase().includes(text) || row.quote?.stock_name?.toLowerCase().includes(text);
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
      if (sort === "change-desc") return (right.quote?.change_percent ?? -Infinity) - (left.quote?.change_percent ?? -Infinity);
      if (sort === "change-asc") return (left.quote?.change_percent ?? Infinity) - (right.quote?.change_percent ?? Infinity);
      if (sort === "name") return (left.quote?.stock_name || left.code).localeCompare(right.quote?.stock_name || right.code, "zh-CN");
      if (sort === "signal") return Number(Boolean(right.signal)) - Number(Boolean(left.signal));
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
        const parsed = await getJson<{ items?: ParsedStockItem[] }>(`${DSA_API}/stocks/parse-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: raw }),
        });
        const match = parsed.items?.find((item) => item.code);
        if (!match?.code) throw new Error(`没有识别到“${raw}”，请尝试完整股票名称或代码`);
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
      toast.error(addError instanceof Error ? addError.message : "加入关注失败");
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
        toast.error(removeError instanceof Error ? removeError.message : "移出关注失败");
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
        toast.error(analysisError instanceof Error ? analysisError.message : "提交分析失败");
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

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selected.has(row.code));
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredRows.forEach((row) => next.delete(row.code));
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StarIcon className="size-4" />
              <h1 className="font-semibold">关注列表</h1>
              <Badge variant="outline">DSA 研究队列</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">实时行情、研究结论与决策信号集中管理</p>
          </div>
          <form
            className="flex w-full gap-2 sm:w-auto sm:min-w-[360px]"
            onSubmit={(event) => {
              event.preventDefault();
              void addStock();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="添加股票名称或代码"
                className="pl-9"
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="添加名称或代码，如 贵州茅台"
                value={addQuery}
              />
            </div>
            <Button disabled={!addQuery.trim() || busyAction === "add"} type="submit">
              {busyAction === "add" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              添加
            </Button>
          </form>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1560px] space-y-4 px-4 py-5 sm:px-6 sm:py-6">
          {!data && !error ? <LoadingWorkspace /> : null}

          {error && !data ? (
            <div className="flex min-h-[460px] items-center justify-center">
              <div className="max-w-md rounded-2xl border p-8 text-center">
                <GaugeIcon className="mx-auto size-7 text-muted-foreground" />
                <h2 className="mt-4 font-semibold">关注数据连接失败</h2>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                <Button className="mt-5" onClick={() => void loadWatchlist()} variant="outline">
                  <RefreshCwIcon />重新连接
                </Button>
              </div>
            </div>
          ) : null}

          {data ? (
            <>
              <SummaryCards rows={data.rows} />

              <Card className="gap-0 py-0 shadow-none">
                <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative sm:w-60">
                      <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        aria-label="筛选关注列表"
                        className="h-8 pl-9"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="筛选名称或代码"
                        value={query}
                      />
                    </div>
                    <div className="flex gap-1 overflow-x-auto">
                      {filters.map((item) => (
                        <Button
                          className="shrink-0"
                          key={item.key}
                          onClick={() => setFilter(item.key)}
                          size="sm"
                          variant={filter === item.key ? "secondary" : "ghost"}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="关注列表排序"
                      className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                      onChange={(event) => setSort(event.target.value as SortKey)}
                      value={sort}
                    >
                      <option value="watchlist">关注顺序</option>
                      <option value="change-desc">涨幅从高到低</option>
                      <option value="change-asc">跌幅从低到高</option>
                      <option value="name">按名称排序</option>
                      <option value="signal">有信号优先</option>
                    </select>
                    <Button disabled={refreshing} onClick={() => void loadWatchlist()} size="sm" variant="outline">
                      <RefreshCwIcon className={cn(refreshing && "animate-spin")} />刷新
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {selectedRows.length ? (
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="size-3" />
                    </span>
                    已选择 {selectedRows.length} 个标的
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={batchResearchHref(selectedRows)}>
                        <MessageSquarePlusIcon />在知衡研究
                      </Link>
                    </Button>
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={() => void runAnalysis(selectedRows.map((row) => row.code))}
                      size="sm"
                      variant="outline"
                    >
                      {busyAction === "analyze" ? <Loader2Icon className="animate-spin" /> : <PlayCircleIcon />}
                      DSA 重新分析
                    </Button>
                    <Button
                      disabled={Boolean(busyAction)}
                      onClick={() => void removeStocks(selectedRows.map((row) => row.code))}
                      size="sm"
                      variant="ghost"
                    >
                      {busyAction === "remove" ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                      移出关注
                    </Button>
                  </div>
                </div>
              ) : null}

              <Card className="gap-0 overflow-hidden py-0 shadow-none">
                <CardHeader className="flex-row items-center justify-between border-b px-4 py-3">
                  <div>
                    <CardTitle className="text-sm">研究队列</CardTitle>
                    <CardDescription>{filteredRows.length} 个标的 · 行情每分钟自动刷新</CardDescription>
                  </div>
                  <span className="text-[11px] text-muted-foreground">更新于 {formatDateTime(data.loadedAt)}</span>
                </CardHeader>

                {filteredRows.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <StarIcon className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">没有符合条件的标的</p>
                    <p className="mt-1 text-xs text-muted-foreground">调整筛选条件，或在页面顶部添加股票。</p>
                  </div>
                ) : null}

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1120px] border-collapse text-left">
                    <thead className="bg-muted/35 text-[11px] text-muted-foreground">
                      <tr>
                        <th className="w-11 px-4 py-3 font-medium">
                          <input
                            aria-label="选择当前全部标的"
                            checked={allVisibleSelected}
                            className="size-3.5 accent-primary"
                            onChange={toggleAllVisible}
                            type="checkbox"
                          />
                        </th>
                        <th className="px-3 py-3 font-medium">标的</th>
                        <th className="px-3 py-3 font-medium">实时行情</th>
                        <th className="px-3 py-3 font-medium">60 日走势</th>
                        <th className="px-3 py-3 font-medium">DSA 信号</th>
                        <th className="px-3 py-3 font-medium">最近研究</th>
                        <th className="px-4 py-3 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredRows.map((row) => {
                        const change = row.quote?.change_percent ?? 0;
                        const positive = change >= 0;
                        const expanded = expandedCode === row.code;
                        return (
                          <tr className="align-top" key={row.code}>
                            <td className="px-4 py-4">
                              <input
                                aria-label={`选择 ${row.quote?.stock_name || row.code}`}
                                checked={selected.has(row.code)}
                                className="size-3.5 accent-primary"
                                onChange={() => toggleSelected(row.code)}
                                type="checkbox"
                              />
                            </td>
                            <td className="px-3 py-4">
                              <p className="font-medium">{row.quote?.stock_name || row.research?.stock_name || row.code}</p>
                              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.code}</p>
                              {row.task ? (
                                <Badge className="mt-2" variant="secondary">
                                  <Loader2Icon className="animate-spin" />{row.task.progress}%
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-3 py-4">
                              <p className="font-semibold tabular-nums">{formatNumber(row.quote?.current_price)}</p>
                              <p className={cn("mt-1 text-xs font-medium tabular-nums", percentTone(change))}>
                                {positive ? "+" : ""}{formatNumber(change)}%
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground">额 {formatCompactAmount(row.quote?.amount)}</p>
                            </td>
                            <td className="px-3 py-4">
                              <MiniTrend history={row.history} positive={positive} />
                              <p className="mt-1.5 text-[10px] text-muted-foreground">
                                高 {formatNumber(row.quote?.high)} · 低 {formatNumber(row.quote?.low)}
                              </p>
                            </td>
                            <td className="px-3 py-4"><SignalSummary signal={row.signal} /></td>
                            <td className="max-w-[260px] px-3 py-4">
                              {row.research ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="secondary">{row.research.action_label || row.research.action || "已分析"}</Badge>
                                    <span className="text-[10px] text-muted-foreground">{formatDateTime(row.research.created_at)}</span>
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {row.research.analysis_summary || row.research.trend_prediction}
                                  </p>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">尚无研究记录</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-1.5">
                                <Button asChild size="sm" variant="secondary">
                                  <Link href={singleResearchHref(row)}><MessageSquarePlusIcon />研究</Link>
                                </Button>
                                <Button
                                  aria-label={`DSA 分析 ${row.quote?.stock_name || row.code}`}
                                  disabled={Boolean(busyAction) || Boolean(row.task)}
                                  onClick={() => void runAnalysis([row.code])}
                                  size="icon-sm"
                                  variant="outline"
                                >
                                  <PlayCircleIcon />
                                </Button>
                                <Button
                                  aria-label={expanded ? "收起详情" : "展开详情"}
                                  onClick={() => setExpandedCode(expanded ? null : row.code)}
                                  size="icon-sm"
                                  variant="ghost"
                                >
                                  {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                </Button>
                                <Button
                                  aria-label={`移除 ${row.quote?.stock_name || row.code}`}
                                  disabled={Boolean(busyAction)}
                                  onClick={() => void removeStocks([row.code])}
                                  size="icon-sm"
                                  variant="ghost"
                                >
                                  <Trash2Icon />
                                </Button>
                              </div>
                              {expanded ? (
                                <div className="absolute left-4 right-4 mt-4 hidden" />
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {expandedCode ? (
                    <div className="border-t p-4">
                      {filteredRows.find((row) => row.code === expandedCode) ? (
                        <ExpandedDetails row={filteredRows.find((row) => row.code === expandedCode)!} />
                      ) : null}
                    </div>
                  ) : null}
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
                            aria-label={`选择 ${row.quote?.stock_name || row.code}`}
                            checked={selected.has(row.code)}
                            className="mt-1 size-3.5 accent-primary"
                            onChange={() => toggleSelected(row.code)}
                            type="checkbox"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{row.quote?.stock_name || row.code}</p>
                                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.code}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold tabular-nums">{formatNumber(row.quote?.current_price)}</p>
                                <p className={cn("mt-1 text-xs font-medium", percentTone(change))}>
                                  {positive ? "+" : ""}{formatNumber(change)}%
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
                              <MiniTrend history={row.history} positive={positive} />
                              <SignalSummary signal={row.signal} />
                            </div>
                            <div className="mt-4 flex gap-2 border-t pt-3">
                              <Button asChild className="flex-1" size="sm" variant="secondary">
                                <Link href={singleResearchHref(row)}><MessageSquarePlusIcon />研究</Link>
                              </Button>
                              <Button
                                disabled={Boolean(busyAction) || Boolean(row.task)}
                                onClick={() => void runAnalysis([row.code])}
                                size="icon-sm"
                                variant="outline"
                              >
                                <PlayCircleIcon />
                              </Button>
                              <Button
                                onClick={() => setExpandedCode(expanded ? null : row.code)}
                                size="icon-sm"
                                variant="ghost"
                              >
                                {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                              </Button>
                              <Button onClick={() => void removeStocks([row.code])} size="icon-sm" variant="ghost">
                                <Trash2Icon />
                              </Button>
                            </div>
                            {expanded ? <div className="mt-4"><ExpandedDetails row={row} /></div> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <NewspaperIcon className="size-3" /> DSA 已连接 {data.intelligence.length} 条近期资讯
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
