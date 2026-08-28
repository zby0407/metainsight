"use client";

import { StarIcon } from "lucide-react";
import { useState } from "react";

import {
  formatPortfolioAmount,
  type PortfolioDashboardItem,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

function formatDate(value: string, locale: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  }).format(date);
}

function formatDecimal(value: string, locale: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);
}

export function HoldingsCard({ item }: { item: PortfolioDashboardItem }) {
  const { locale } = useI18n();
  const [favorite, setFavorite] = useState(false);
  const review = item.latestReview;

  const highlights = review
    ? review.summary
        .split(/(?<=[。！？])/u)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(22,20,18,0.04),0_4px_16px_rgba(22,20,18,0.06)]">
      {/* header */}
      <div className="flex items-center gap-2 px-6 pt-5">
        <button className="text-foreground/80 hover:text-foreground text-[11px] font-bold tracking-[0.18em] uppercase">
          持仓与复盘 &gt;
        </button>
        <button
          onClick={() => setFavorite((v) => !v)}
          className={cn(
            "ml-auto flex size-8 items-center justify-center rounded-lg transition-colors",
            favorite
              ? "text-[#b45309]"
              : "text-foreground/40 hover:text-foreground",
          )}
          aria-label="收藏"
        >
          <StarIcon className="size-4" fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* left — positions */}
        <div>
          <div className="text-foreground font-serif text-3xl font-normal tracking-[-0.02em] tabular-nums">
            {item.positions.length}
            <span className="text-muted-foreground ml-2 text-base">只持仓</span>
          </div>

          <div className="mt-4 space-y-2">
            {item.positions.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                暂无持仓
              </p>
            ) : (
              item.positions.map((position) => (
                <div
                  key={position.id}
                  className="border-border flex items-center justify-between rounded-xl border px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-foreground truncate text-sm font-medium">
                      {position.name || position.symbol}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {position.symbol} · {position.market}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-foreground text-sm font-medium tabular-nums">
                      {formatPortfolioAmount(
                        position.averageCost,
                        position.currency,
                        locale,
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                      {formatDecimal(position.quantity, locale)} 股
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {item.cashBalances.length > 0 ? (
            <div className="mt-4">
              <div className="text-muted-foreground text-xs font-medium">
                现金
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.cashBalances.map((balance) => (
                  <span
                    key={balance.id}
                    className="border-border rounded-full border px-3 py-1.5 text-sm tabular-nums"
                  >
                    {formatPortfolioAmount(
                      balance.amount,
                      balance.currency,
                      locale,
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* right — latest review / activity */}
        <div className="border-border md:border-l md:pl-6">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              最新复盘
            </div>
            {review ? (
              <time className="text-muted-foreground text-xs">
                {formatDate(review.reviewDate, locale)}
              </time>
            ) : null}
          </div>

          {review && highlights.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {highlights.map((highlight, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-foreground/80 text-sm leading-6">
                    {highlight}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground mt-4 text-sm">
              暂无复盘记录。运行一次复盘，让 AI 帮你总结组合表现。
            </p>
          )}

          {review ? (
            <div className="mt-5">
              <span
                className={cn(
                  "inline-block rounded-full px-3 py-1 text-xs font-medium",
                  review.assessment === "on_track" &&
                    "bg-[#F1F9EE] text-[#478433]",
                  review.assessment === "watch" &&
                    "bg-[#FFF2F2] text-[#B45309]",
                  review.assessment === "breached" &&
                    "bg-[#FFF2F2] text-[#b91c1c]",
                  review.assessment === "insufficient_data" &&
                    "bg-muted text-muted-foreground",
                )}
              >
                {review.assessment === "on_track" && "运行正常"}
                {review.assessment === "watch" && "需要关注"}
                {review.assessment === "breached" && "已偏离"}
                {review.assessment === "insufficient_data" && "数据不足"}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
