"use client";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { cn } from "@/lib/utils";

const SETTINGS_API = "/api/v1/dsa-automation/settings";

export interface AutoResearchStock {
  symbol: string;
  name?: string | null;
}

interface RecentRun {
  id: string;
  symbol: string;
  sessionDate: string;
  status: "pending" | "submitted" | "completed" | "failed";
  stockName: string | null;
  summary: string | null;
  error: string | null;
}

interface AutoResearchSettings {
  enabled: boolean;
  symbols: string[];
  maxSymbols: number;
  scheduleTime: string;
  timezone: string;
  maxConcurrentRuns: number;
  recentRuns: RecentRun[];
}

function isAShare(symbol: string) {
  return /^(?:(?:SH|SZ|BJ)?\d{6}|\d{6}\.(?:SH|SS|SZ|BJ))$/i.test(symbol.trim());
}

function canonicalSymbol(symbol: string) {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/\.(?:SH|SS|SZ|BJ)$/, "")
    .replace(/^(?:SH|SZ|BJ)(?=\d{6}$)/, "");
}

async function requestSettings(init?: RequestInit) {
  const response = await fetchWithAuth(SETTINGS_API, init);
  const payload = (await response.json().catch(() => ({}))) as
    | AutoResearchSettings
    | { detail?: string };
  if (!response.ok) {
    throw new Error(
      "detail" in payload && payload.detail
        ? payload.detail
        : `自动研究设置请求失败：${response.status}`,
    );
  }
  return payload as AutoResearchSettings;
}

function statusText(run: RecentRun) {
  if (run.status === "completed") return "已完成";
  if (run.status === "failed") return "未完成";
  if (run.status === "submitted") return "研究中";
  return "等待中";
}

export function DsaAutoResearchPanel({
  stocks,
}: {
  stocks: AutoResearchStock[];
}) {
  const [settings, setSettings] = useState<AutoResearchSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const eligibleStocks = useMemo(() => {
    const seen = new Set<string>();
    return stocks
      .filter((stock) => isAShare(stock.symbol))
      .map((stock) => ({ ...stock, symbol: canonicalSymbol(stock.symbol) }))
      .filter((stock) => {
        if (seen.has(stock.symbol)) return false;
        seen.add(stock.symbol);
        return true;
      });
  }, [stocks]);

  useEffect(() => {
    let cancelled = false;
    void requestSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setEnabled(next.enabled);
        setSelected(next.symbols);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "自动研究设置加载失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = Boolean(
    settings &&
    (enabled !== settings.enabled ||
      selected.join(",") !== settings.symbols.join(",")),
  );
  const latestRun = settings?.recentRuns[0] ?? null;
  const maxSymbols = settings?.maxSymbols ?? 10;

  const toggleSymbol = (symbol: string) => {
    setSelected((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }
      if (current.length >= maxSymbols) {
        toast.error(`每个账户最多选择 ${maxSymbols} 只股票`);
        return current;
      }
      const availableOrder = eligibleStocks.map((stock) => stock.symbol);
      return [...current, symbol].sort(
        (left, right) =>
          availableOrder.indexOf(left) - availableOrder.indexOf(right),
      );
    });
  };

  const save = async () => {
    if (enabled && selected.length === 0) {
      toast.error("请至少选择一只关注股票后再开启");
      return;
    }
    setSaving(true);
    try {
      const next = await requestSettings({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, symbols: selected }),
      });
      setSettings(next);
      setEnabled(next.enabled);
      setSelected(next.symbols);
      toast.success(
        next.enabled ? "收盘自动 DSA 已开启" : "自动研究设置已保存",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <span
            className={cn(
              "size-1.5 rounded-full",
              enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          自动研究
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-base">自动研究设置</DialogTitle>
          <DialogDescription className="text-xs">
            管理收盘后的 DSA 自动研究范围与运行状态
          </DialogDescription>
        </DialogHeader>
        <section className="bg-background">
          <div className="flex flex-col gap-4 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold">收盘自动研究</h2>
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      enabled ? "bg-emerald-500" : "bg-muted-foreground/50",
                    )}
                  />
                  {enabled ? "运行中" : "已停用"}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                交易日收盘数据确认后执行，结果送达 MetaInsight 通知中心
              </p>
            </div>

            <dl className="text-muted-foreground flex items-center divide-x text-[11px] lg:shrink-0">
              <div className="pr-3">
                <dt className="sr-only">执行时间</dt>
                <dd>{settings?.scheduleTime ?? "15:10"} 后检查</dd>
              </div>
              <div className="px-3">
                <dt className="sr-only">已选标的</dt>
                <dd>
                  {selected.length}/{maxSymbols} 只
                </dd>
              </div>
              <div className="pl-3">
                <dt className="sr-only">并发数</dt>
                <dd>并发 {settings?.maxConcurrentRuns ?? 2}</dd>
              </div>
            </dl>

            <div className="flex items-center gap-3 lg:border-l lg:pl-4">
              <span className="text-xs font-medium">自动运行</span>
              <Switch
                aria-label="每日收盘自动运行 DSA"
                checked={enabled}
                disabled={loading}
                onCheckedChange={setEnabled}
              />
              <Button
                disabled={
                  loading || saving || !dirty || (enabled && !selected.length)
                }
                onClick={() => void save()}
                size="sm"
                variant="outline"
              >
                {saving ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SaveIcon />
                )}
                保存设置
              </Button>
            </div>
          </div>

          <div className="flex flex-col border-t lg:flex-row">
            <details className="group min-w-0 flex-1">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium marker:hidden sm:px-5">
                <span>研究范围</span>
                <span className="text-muted-foreground font-normal">
                  从当前关注列表选择
                </span>
              </summary>
              <div className="grid max-h-48 overflow-y-auto border-t sm:grid-cols-2 xl:grid-cols-3">
                {eligibleStocks.map((stock) => {
                  const checked = selected.includes(stock.symbol);
                  return (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 text-xs transition-colors sm:border-r",
                        checked ? "bg-muted/50" : "hover:bg-muted/30",
                      )}
                      key={stock.symbol}
                    >
                      <input
                        checked={checked}
                        className="accent-primary size-3.5"
                        onChange={() => toggleSymbol(stock.symbol)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {stock.name ?? stock.symbol}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {stock.symbol}
                      </span>
                    </label>
                  );
                })}
                {eligibleStocks.length === 0 ? (
                  <p className="text-muted-foreground col-span-full py-5 text-center text-xs">
                    当前关注列表中没有可设置的 A 股标的
                  </p>
                ) : null}
              </div>
            </details>

            {latestRun ? (
              <div className="flex items-center justify-between gap-4 border-t px-4 py-3 text-[11px] sm:px-5 lg:w-80 lg:border-t-0 lg:border-l">
                <span className="text-muted-foreground">最近任务</span>
                <span className="min-w-0 truncate text-right">
                  <span className="font-medium">{statusText(latestRun)}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground">
                    {latestRun.stockName ?? latestRun.symbol}{" "}
                    {latestRun.sessionDate}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
