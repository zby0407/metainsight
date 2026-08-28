"use client";

import {
  CheckCircle2Icon,
  Clock3Icon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  return /^(?:(?:SH|SZ|BJ)?\d{6}|\d{6}\.(?:SH|SS|SZ|BJ))$/i.test(
    symbol.trim(),
  );
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
      toast.success(next.enabled ? "收盘自动 DSA 已开启" : "自动研究设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SparklesIcon className="size-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">收盘自动 DSA</h2>
                  <Badge variant={enabled ? "default" : "outline"}>
                    {enabled ? "已开启" : "未开启"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A 股交易日收盘数据确认后自动研究，并通过知衡通知中心送达
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                <Clock3Icon className="size-3" />
                {settings?.scheduleTime ?? "15:10"} 后检查 · Asia/Shanghai
              </span>
              <span className="rounded-md bg-muted/50 px-2 py-1">
                已选 {selected.length}/{maxSymbols} 只
              </span>
              <span className="rounded-md bg-muted/50 px-2 py-1">
                全站并发上限 {settings?.maxConcurrentRuns ?? 2}
              </span>
            </div>

            <details className="group mt-4 rounded-lg border bg-muted/10">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium marker:hidden">
                选择自动研究股票
                <span className="ml-2 font-normal text-muted-foreground">
                  从当前关注列表中选择
                </span>
              </summary>
              <div className="grid max-h-52 gap-2 overflow-y-auto border-t p-3 sm:grid-cols-2 xl:grid-cols-3">
                {eligibleStocks.map((stock) => {
                  const checked = selected.includes(stock.symbol);
                  return (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                        checked
                          ? "border-primary/50 bg-primary/5"
                          : "hover:bg-muted/50",
                      )}
                      key={stock.symbol}
                    >
                      <input
                        checked={checked}
                        className="size-3.5 accent-primary"
                        onChange={() => toggleSymbol(stock.symbol)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {stock.name || stock.symbol}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {stock.symbol}
                      </span>
                    </label>
                  );
                })}
                {eligibleStocks.length === 0 ? (
                  <p className="col-span-full py-3 text-center text-xs text-muted-foreground">
                    当前关注列表中没有可设置的 A 股标的
                  </p>
                ) : null}
              </div>
            </details>
          </div>

          <div className="flex min-w-[220px] flex-col gap-3 rounded-xl border bg-muted/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">每日自动运行</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  默认关闭，由当前账户自行开启
                </p>
              </div>
              <Switch
                aria-label="每日收盘自动运行 DSA"
                checked={enabled}
                disabled={loading}
                onCheckedChange={setEnabled}
              />
            </div>

            {latestRun ? (
              <div className="border-t pt-3 text-[11px] text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2Icon className="size-3.5" />
                  最近任务 · {statusText(latestRun)}
                </p>
                <p className="mt-1 line-clamp-2">
                  {latestRun.stockName || latestRun.symbol} · {latestRun.sessionDate}
                </p>
              </div>
            ) : null}

            <Button
              disabled={loading || saving || !dirty || (enabled && !selected.length)}
              onClick={() => void save()}
              size="sm"
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
      </CardContent>
    </Card>
  );
}
