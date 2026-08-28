"use client";

import {
  AlertTriangleIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  MessageCircleQuestionMarkIcon,
  NewspaperIcon,
  RefreshCwIcon,
  Share2Icon,
  StarIcon,
  TrendingUpIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LocalWeatherRail } from "@/components/news/local-weather-rail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  createNewsArticleFollowUpHref,
  createNewsFollowUpHref,
  getNewsEvent,
  getNewsFeed,
  newsCoverageLabel,
  type NewsArticle,
  type NewsChannel,
  type NewsClaim,
  type NewsEventDetail,
  type NewsEventSummary,
  summaryStatusLabel,
} from "@/core/finance/news";
import {
  DEFAULT_NEWS_PREFERENCES,
  NEWS_TOPICS,
  rankPersonalizedEvents,
  readRemoteNewsPreferences,
  readNewsPreferences,
  toggleSavedEvent,
  toggleTopic,
  writeNewsPreferences,
  writeRemoteNewsPreferences,
  type NewsPreferences,
} from "@/core/finance/news-preferences";
import { cn } from "@/lib/utils";

type NewsView = "for-you" | NewsChannel | "saved";

const VIEWS: Array<{ key: NewsView; label: string }> = [
  { key: "for-you", label: "为您" },
  { key: "general", label: "综合" },
  { key: "technology", label: "科技" },
  { key: "sports", label: "体育" },
  { key: "saved", label: "收藏" },
];

const NEWS_FEED_SORT = "top" as const;

function isView(value: string | null): value is NewsView {
  return VIEWS.some((item) => item.key === value);
}

export function NewsWorkspace({ eventId }: { eventId?: string }) {
  if (eventId) return <EventDetail eventId={eventId} />;
  return <NewsFeed />;
}

function NewsFeed() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedView = searchParams.get("view") ?? searchParams.get("channel");
  const view: NewsView = isView(requestedView) ? requestedView : "for-you";
  const [events, setEvents] = useState<NewsEventSummary[]>([]);
  const [preferences, setPreferences] = useState<NewsPreferences>(
    DEFAULT_NEWS_PREFERENCES,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesOwnerId, setPreferencesOwnerId] = useState<string | null>(
    null,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<{
    freshness: "fresh" | "quiet" | "stale" | "unavailable";
    collector: "healthy" | "degraded" | "unavailable";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPreferencesReady(false);
    setPreferencesOwnerId(null);
    if (!user) return;
    const local = readNewsPreferences(user.id, window.localStorage);
    setPreferences(local);
    setPreferencesOwnerId(user.id);
    setPreferencesReady(true);
    let cancelled = false;
    void readRemoteNewsPreferences()
      .then(async (remote) => {
        if (cancelled) return;
        if (!remote.configured) {
          void writeRemoteNewsPreferences(local).catch(() => undefined);
          return;
        }
        const savedById = new Map(
          local.savedEvents.map((event) => [event.id, event]),
        );
        const missingIds = remote.savedEventIds
          .filter((eventId) => !savedById.has(eventId))
          .slice(0, 50);
        const hydrated = await Promise.allSettled(
          missingIds.map((eventId) => getNewsEvent(eventId)),
        );
        for (const result of hydrated) {
          if (result.status === "fulfilled")
            savedById.set(result.value.id, result.value);
        }
        if (cancelled) return;
        const merged = {
          ...local,
          followedTopics: remote.followedTopics,
          savedEvents: remote.savedEventIds
            .map((eventId) => savedById.get(eventId))
            .filter((event): event is NewsEventSummary => Boolean(event)),
          notificationsEnabled: remote.notificationsEnabled,
          lastNotifiedAt: remote.lastNotifiedAt,
        };
        setPreferences(merged);
        writeNewsPreferences(user.id, merged, window.localStorage);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const updatePreferences = useCallback(
    (next: NewsPreferences) => {
      if (!user?.id || preferencesOwnerId !== user.id) return;
      setPreferences(next);
      writeNewsPreferences(user.id, next, window.localStorage);
      void writeRemoteNewsPreferences(next).catch(() => {
        toast.error("新闻偏好暂时未能同步");
      });
    },
    [preferencesOwnerId, user],
  );

  useEffect(() => {
    if (!preferencesReady || preferencesOwnerId !== user?.id) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const feedRequest =
      view === "saved"
        ? Promise.resolve(null)
        : view === "for-you"
          ? Promise.all(
              ["general", "technology", "sports"]
                .map((channel) =>
                  getNewsFeed(
                    channel as NewsChannel,
                    NEWS_FEED_SORT,
                    null,
                    20,
                    controller.signal,
                  ),
                )
                .map((request) => request.catch(() => null)),
            ).then((feeds) => {
              const available = feeds.filter(
                (feed): feed is NonNullable<typeof feed> => feed !== null,
              );
              if (available.length === 0) throw new Error("新闻频道暂时不可用");
              return available;
            })
          : getNewsFeed(view, NEWS_FEED_SORT, null, 24, controller.signal);

    feedRequest
      .then((result) => {
        if (cancelled) return;
        setNextCursor(null);
        if (view === "saved") {
          setEvents(preferences.savedEvents);
          setFeedStatus(null);
        } else if (Array.isArray(result)) {
          setEvents(
            rankPersonalizedEvents(
              result.flatMap((feed) => feed.items),
              preferences.followedTopics,
            ).slice(0, 20),
          );
          const degraded =
            result.some((feed) => feed.collectorStatus !== "healthy") ||
            result.length < 3;
          const stale = result.some(
            (feed) =>
              feed.freshnessStatus === "stale" ||
              feed.freshnessStatus === "unavailable",
          );
          const quiet = result.every(
            (feed) => feed.freshnessStatus === "quiet",
          );
          setFeedStatus({
            freshness: stale ? "stale" : quiet ? "quiet" : "fresh",
            collector: degraded ? "degraded" : "healthy",
          });
        } else if (result) {
          setEvents(result.items);
          setNextCursor(result.nextCursor);
          setFeedStatus({
            freshness: result.freshnessStatus,
            collector: result.collectorStatus,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "新闻资讯暂时不可用",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    preferences.followedTopics,
    preferences.savedEvents,
    preferencesOwnerId,
    preferencesReady,
    refreshKey,
    user?.id,
    view,
  ]);

  const featured = events[0];
  const cards = events.slice(1);
  const returnTo = `/workspace/news?view=${view}`;
  const eventHref = (eventId: string) =>
    `/workspace/news/${eventId}?from=${encodeURIComponent(returnTo)}`;

  function navigate(nextView: NewsView) {
    router.replace(`/workspace/news?view=${nextView}`);
  }

  function saveEvent(event: NewsEventSummary) {
    const saved = !preferences.savedEvents.some((item) => item.id === event.id);
    updatePreferences(toggleSavedEvent(preferences, event));
    toast.success(saved ? "已收藏" : "已取消收藏");
  }

  async function loadMore() {
    if (view === "for-you" || view === "saved" || !nextCursor || loadingMore)
      return;
    setLoadingMore(true);
    try {
      const feed = await getNewsFeed(view, NEWS_FEED_SORT, nextCursor);
      setEvents((current) => {
        const unique = new Map(
          [...current, ...feed.items].map((event) => [event.id, event]),
        );
        return [...unique.values()];
      });
      setNextCursor(feed.nextCursor);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="bg-background min-h-screen overflow-y-auto">
      <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="md:hidden" />
        <NewspaperIcon className="size-5" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">新闻资讯</h1>
          <p className="text-muted-foreground hidden text-xs sm:block">
            今日重要新闻与多家媒体报道
          </p>
        </div>
        <NewsPreferencesDialog
          disabled={!preferencesReady}
          preferences={preferences}
          onPreferencesChange={updatePreferences}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRefreshKey((key) => key + 1)}
          aria-label="刷新新闻资讯"
        >
          <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8">
        <div className="mb-7 border-b">
          <nav
            className="flex max-w-full overflow-x-auto"
            aria-label="新闻资讯频道"
          >
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                className={cn(
                  "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  view === item.key
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {feedStatus && feedStatus.freshness !== "fresh" && (
          <FreshnessBanner status={feedStatus} />
        )}

        {error ? (
          <StateCard icon={<AlertTriangleIcon />} text={error} />
        ) : loading && events.length === 0 ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <StateCard
            icon={<NewspaperIcon />}
            text="这个频道暂时没有可展示的事件。"
          />
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              {featured && (
                <FeaturedEvent
                  event={featured}
                  href={eventHref(featured.id)}
                  saved={preferences.savedEvents.some(
                    (item) => item.id === featured.id,
                  )}
                  onSave={saveEvent}
                />
              )}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {cards.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    href={eventHref(event.id)}
                    saved={preferences.savedEvents.some(
                      (item) => item.id === event.id,
                    )}
                    onSave={saveEvent}
                  />
                ))}
              </div>
              {nextCursor && view !== "for-you" && view !== "saved" && (
                <Button
                  className="mt-6 w-full"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  variant="outline"
                >
                  <ChevronDownIcon
                    className={cn(loadingMore && "animate-pulse")}
                  />
                  {loadingMore ? "正在加载" : "加载更多"}
                </Button>
              )}
            </div>
            <RightRail />
          </div>
        )}
      </main>
    </div>
  );
}

function FeaturedEvent({
  event,
  href,
  saved,
  onSave,
}: {
  event: NewsEventSummary;
  href: string;
  saved: boolean;
  onSave: (event: NewsEventSummary) => void;
}) {
  return (
    <article className="border-b pb-6">
      <div
        className={cn(
          "grid gap-6",
          event.imageUrl && "md:grid-cols-[1.08fr_0.92fr] md:items-stretch",
        )}
      >
        <Link
          href={href}
          className="group flex min-w-0 flex-col justify-center py-2"
        >
          <SummaryBadge event={event} />
          <h2 className="group-hover:text-foreground/75 mt-4 text-2xl leading-tight font-semibold tracking-tight transition-colors md:text-[2.1rem]">
            {event.title}
          </h2>
          {event.summary && (
            <p className="text-muted-foreground mt-4 line-clamp-4 leading-7">
              {event.summary}
            </p>
          )}
        </Link>
        {event.imageUrl && (
          <Link
            href={href}
            className="min-h-64 overflow-hidden rounded-lg"
            aria-label={`查看：${event.title}`}
          >
            <EventImage event={event} className="h-full min-h-64" priority />
          </Link>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <EventMeta event={event} />
        <EventUtilities event={event} saved={saved} onSave={onSave} />
      </div>
    </article>
  );
}

function EventCard({
  event,
  href,
  saved,
  onSave,
}: {
  event: NewsEventSummary;
  href: string;
  saved: boolean;
  onSave: (event: NewsEventSummary) => void;
}) {
  return (
    <article className="flex h-full flex-col border-b pb-5">
      {event.imageUrl && (
        <Link
          href={href}
          className="mb-4 block overflow-hidden rounded-lg"
          aria-label={`查看：${event.title}`}
        >
          <EventImage event={event} className="h-44" />
        </Link>
      )}
      <Link href={href} className="group block">
        <SummaryBadge event={event} />
        <h3 className="group-hover:text-foreground/75 mt-3 line-clamp-3 text-lg leading-7 font-semibold transition-colors">
          {event.title}
        </h3>
        {event.summary && (
          <p className="text-muted-foreground mt-3 line-clamp-3 text-sm leading-6">
            {event.summary}
          </p>
        )}
      </Link>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <EventMeta event={event} />
        <EventUtilities event={event} saved={saved} onSave={onSave} />
      </div>
    </article>
  );
}

function EventUtilities({
  event,
  saved,
  onSave,
}: {
  event: NewsEventSummary;
  saved: boolean;
  onSave: (event: NewsEventSummary) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        aria-label={saved ? "取消收藏" : "收藏"}
        className="size-8"
        onClick={() => onSave(event)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <BookmarkIcon className={cn("size-4", saved && "fill-current")} />
      </Button>
      <Button
        aria-label="分享"
        className="size-8"
        onClick={() => void shareEvent(event)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Share2Icon className="size-4" />
      </Button>
    </div>
  );
}

async function shareEvent(event: NewsEventSummary) {
  const url = `${window.location.origin}/workspace/news/${event.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: event.title, text: event.summary, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("链接已复制");
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    toast.error("分享失败，请稍后重试");
  }
}

function FreshnessBanner({
  status,
}: {
  status: {
    freshness: "fresh" | "quiet" | "stale" | "unavailable";
    collector: "healthy" | "degraded" | "unavailable";
  };
}) {
  const quiet = status.freshness === "quiet" && status.collector === "healthy";
  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        quiet
          ? "border-sky-500/25 bg-sky-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      {quiet ? (
        <NewspaperIcon className="mt-0.5 size-4 shrink-0 text-sky-600" />
      ) : (
        <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <div>
        <strong>{quiet ? "暂时没有新动态" : "部分内容更新较慢"}</strong>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          {quiet
            ? "你可以先阅读这个频道最近的重要报道。"
            : "现有报道仍可阅读，新的内容正在陆续补充。"}
        </p>
      </div>
    </div>
  );
}

function EventImage({
  event,
  className,
  priority = false,
}: {
  event: NewsEventSummary;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return event.imageUrl && !failed ? (
    <img
      alt={`${event.title}相关报道配图`}
      className={cn("bg-muted w-full object-cover", className)}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      src={event.imageUrl}
    />
  ) : null;
}

function SummaryBadge({ event }: { event: NewsEventSummary }) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex w-fit items-center text-xs font-medium",
        event.summaryStatus === "ready" &&
          event.sourceCount > 1 &&
          "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {summaryStatusLabel(event.summaryStatus, event.sourceCount)}
    </span>
  );
}

function SourceIdentity({ name }: { name: string }) {
  const initial = name.trim().slice(0, 1) || "闻";
  return (
    <span className="text-foreground inline-flex min-w-0 items-center gap-1.5 font-medium">
      <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]">
        {initial}
      </span>
      <span className="max-w-28 truncate">{name}</span>
    </span>
  );
}

function EventMeta({
  event,
  className,
}: {
  event: NewsEventSummary;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs",
        className,
      )}
    >
      <SourceIdentity name={event.representativeSource} />
      {(event.sourceCount > 1 || event.articleCount > 1) && <span>·</span>}
      {event.sourceCount > 1 ? (
        <span>{newsCoverageLabel(event)}</span>
      ) : event.articleCount > 1 ? (
        <span>{event.articleCount} 篇报道</span>
      ) : null}
      <span>·</span>
      <time dateTime={event.lastPublishedAt}>
        {formatTime(event.lastPublishedAt)}
      </time>
    </div>
  );
}

function NewsPreferencesDialog({
  disabled,
  preferences,
  onPreferencesChange,
}: {
  disabled: boolean;
  preferences: NewsPreferences;
  onPreferencesChange: (preferences: NewsPreferences) => void;
}) {
  function toggleNotifications(enabled: boolean) {
    onPreferencesChange({
      ...preferences,
      notificationsEnabled: enabled,
    });
    toast.success(enabled ? "新动态会送达通知中心" : "已关闭话题提醒");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled} size="sm" type="button" variant="outline">
          <StarIcon className="size-4" />
          关注
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="text-base">关注设置</DialogTitle>
          <DialogDescription className="text-xs">
            调整“为您”信息流的主题偏好和提醒方式
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-5">
          <section className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium">站内提醒</h3>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                关注主题出现重要动态时送达通知中心。
              </p>
            </div>
            <Switch
              aria-label="关注话题通知"
              checked={preferences.notificationsEnabled}
              onCheckedChange={toggleNotifications}
            />
          </section>
          <section className="mt-5 border-t pt-5">
            <h3 className="text-sm font-medium">关注话题</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              选中的主题会在“为您”中优先展示。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {NEWS_TOPICS.map((topic) => {
                const followed = preferences.followedTopics.includes(topic);
                return (
                  <button
                    aria-pressed={followed}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      followed
                        ? "border-foreground bg-foreground text-background"
                        : "hover:bg-muted",
                    )}
                    key={topic}
                    onClick={() =>
                      onPreferencesChange(toggleTopic(preferences, topic))
                    }
                    type="button"
                  >
                    {followed && <CheckIcon className="size-3" />}
                    {topic}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RightRail() {
  return (
    <aside className="space-y-8 xl:sticky xl:top-20 xl:self-start">
      <LocalWeatherRail />
      <MarketRail />
    </aside>
  );
}

interface MarketIndexSnapshot {
  code: string;
  name: string;
  current: number;
  change_pct: number;
}

interface MarketReviewSnapshot {
  indices?: MarketIndexSnapshot[] | null;
  market_light?: {
    label: string;
    temperature_label: string;
    score: number;
  } | null;
}

function MarketRail() {
  const [market, setMarket] = useState<MarketReviewSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMarketSnapshot().then((value) => {
      if (!cancelled) setMarket(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!market || (market.indices?.length ?? 0) === 0) return null;

  return (
    <section className="border-b pb-5">
      <div className="flex items-center justify-between pb-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <TrendingUpIcon className="size-4" /> 市场脉搏
        </h2>
        {market.market_light && (
          <span className="text-muted-foreground text-xs">
            {market.market_light.temperature_label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 border-t border-l">
        {market.indices?.slice(0, 4).map((index) => (
          <div
            className="border-r border-b p-4 even:border-r-0"
            key={index.code}
          >
            <div className="truncate text-xs font-medium">{index.name}</div>
            <div className="mt-2 text-sm font-semibold">
              {new Intl.NumberFormat("zh-CN", {
                maximumFractionDigits: 2,
              }).format(index.current)}
            </div>
            <div
              className={cn(
                "mt-1 text-xs",
                index.change_pct > 0
                  ? "text-rose-500"
                  : index.change_pct < 0
                    ? "text-emerald-600"
                    : "text-muted-foreground",
              )}
            >
              {index.change_pct > 0 ? "+" : ""}
              {index.change_pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
      <Button asChild className="mt-3 px-0" size="sm" variant="link">
        <Link href="/workspace/market">查看市场全景</Link>
      </Button>
    </section>
  );
}

async function loadMarketSnapshot(): Promise<MarketReviewSnapshot | null> {
  try {
    const historyResponse = await fetch(
      "/api/v1/market/history?report_type=market_review&limit=4",
      { cache: "no-store", credentials: "include" },
    );
    if (!historyResponse.ok) return null;
    const history = (await historyResponse.json()) as {
      items?: Array<{ id: number }>;
    };
    const details = await Promise.all(
      (history.items ?? []).map(async (item) => {
        const response = await fetch(`/api/v1/market/history/${item.id}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return null;
        return (await response.json()) as {
          details?: {
            context_snapshot?: {
              market_review_payload?: MarketReviewSnapshot & {
                region?: string;
                market_scope?: string;
              };
            };
          };
        };
      }),
    );
    const snapshots = details
      .map((detail) => detail?.details?.context_snapshot?.market_review_payload)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return (
      snapshots.find(
        (item) => item.region === "cn" || item.market_scope?.includes("A股"),
      ) ??
      snapshots[0] ??
      null
    );
  } catch {
    return null;
  }
}

function EventDetail({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<NewsEventDetail | null>(null);
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState<NewsPreferences>(
    DEFAULT_NEWS_PREFERENCES,
  );
  const [preferencesOwnerId, setPreferencesOwnerId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setPreferencesOwnerId(null);
    if (!user) return;
    const local = readNewsPreferences(user.id, window.localStorage);
    setPreferences(local);
    setPreferencesOwnerId(user.id);
    setDetail(null);
    setError("");
    let cancelled = false;
    const controller = new AbortController();
    Promise.all([
      getNewsEvent(eventId, controller.signal),
      readRemoteNewsPreferences().catch(() => null),
    ])
      .then(([value, remote]) => {
        if (cancelled) return;
        setDetail(value);
        if (!remote) return;
        if (!remote.configured) {
          void writeRemoteNewsPreferences(local).catch(() => undefined);
          return;
        }
        const savedEvents = remote.savedEventIds.includes(value.id)
          ? [
              value,
              ...local.savedEvents.filter((event) => event.id !== value.id),
            ]
          : local.savedEvents.filter((event) =>
              remote.savedEventIds.includes(event.id),
            );
        const merged: NewsPreferences = {
          followedTopics: remote.followedTopics,
          savedEvents,
          notificationsEnabled: remote.notificationsEnabled,
          lastNotifiedAt: remote.lastNotifiedAt,
        };
        setPreferences(merged);
        writeNewsPreferences(user.id, merged, window.localStorage);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "事件加载失败");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [eventId, user]);

  const articlesById = useMemo(
    () =>
      new Map((detail?.articles ?? []).map((article) => [article.id, article])),
    [detail],
  );
  const requestedReturnTo = searchParams.get("from");
  const returnTo =
    requestedReturnTo?.startsWith("/workspace/news?") === true
      ? requestedReturnTo
      : detail
        ? `/workspace/news?view=${detail.channel}`
        : "/workspace/news";

  function saveDetail() {
    if (!detail || !user?.id || preferencesOwnerId !== user.id) return;
    const saved = !preferences.savedEvents.some(
      (item) => item.id === detail.id,
    );
    const next = toggleSavedEvent(preferences, detail);
    setPreferences(next);
    writeNewsPreferences(user.id, next, window.localStorage);
    void writeRemoteNewsPreferences(next).catch(() => {
      toast.error("收藏暂时未能同步");
    });
    toast.success(saved ? "已收藏" : "已取消收藏");
  }

  if (error)
    return (
      <div className="p-8">
        <StateCard icon={<AlertTriangleIcon />} text={error} />
      </div>
    );
  if (!detail)
    return (
      <div className="p-8">
        <FeedSkeleton />
      </div>
    );

  return (
    <div className="bg-background min-h-screen overflow-y-auto">
      <header className="bg-background/95 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="md:hidden" />
        <Link
          href={returnTo}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← 返回新闻资讯
        </Link>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
        <SummaryBadge event={detail} />
        <h1 className="mt-4 max-w-5xl text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
          {detail.title}
        </h1>
        <p className="text-muted-foreground mt-5 max-w-4xl text-base leading-8 md:text-lg">
          {detail.summary}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <EventMeta event={detail} />
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href={createNewsFollowUpHref(detail)}>
                <MessageCircleQuestionMarkIcon />
                追问此事件
              </Link>
            </Button>
            <Button onClick={saveDetail} size="sm" variant="outline">
              <BookmarkIcon
                className={cn(
                  preferences.savedEvents.some(
                    (item) => item.id === detail.id,
                  ) && "fill-current",
                )}
              />
              {preferences.savedEvents.some((item) => item.id === detail.id)
                ? "已收藏"
                : "收藏"}
            </Button>
            <Button
              onClick={() => void shareEvent(detail)}
              size="sm"
              variant="outline"
            >
              <Share2Icon /> 分享
            </Button>
          </div>
        </div>

        <div className="mt-10 max-w-4xl">
          <div className="min-w-0 space-y-10">
            {detail.claims.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold">已核实要点</h2>
                <div className="mt-4 border-t">
                  {detail.claims.map((claim, index) => (
                    <div
                      key={`${claim.text}-${index}`}
                      className="grid gap-3 border-b py-5 sm:grid-cols-[32px_minmax(0,1fr)]"
                    >
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="leading-7">{claim.text}</p>
                          <EvidenceLabel
                            count={claim.independentSourceCount}
                            kind={claim.evidenceKind}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                          {claim.sourceArticleIds.map((id) => (
                            <SourceLink
                              key={id}
                              article={articlesById.get(id)}
                              id={id}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {detail.disagreements.length > 0 && (
              <section className="border-l-2 border-amber-500 bg-amber-500/5 px-6 py-5">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <AlertTriangleIcon className="size-5 text-amber-600" />
                  来源存在分歧
                </h2>
                <div className="mt-5 space-y-5">
                  {detail.disagreements.map((item) => (
                    <div key={item.topic}>
                      <h3 className="font-medium">{item.topic}</h3>
                      {item.positions.map((position, index) => (
                        <div
                          key={index}
                          className="mt-3 border-t border-amber-500/20 pt-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-muted-foreground text-sm leading-6">
                              {position.text}
                            </p>
                            <EvidenceLabel
                              count={position.independentSourceCount}
                              kind={position.evidenceKind}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                            {position.sourceArticleIds.map((id) => (
                              <SourceLink
                                key={id}
                                article={articlesById.get(id)}
                                id={id}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-2xl font-semibold">报道脉络</h2>
              <div className="mt-4 border-t">
                {detail.articles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    event={detail}
                  />
                ))}
              </div>
            </section>

            {detail.relatedEvents.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold">相关事件</h2>
                <div className="mt-4 divide-y border-y">
                  {detail.relatedEvents.map((event) => (
                    <Link
                      className="group flex items-start justify-between gap-4 py-4"
                      href={`/workspace/news/${event.id}?from=${encodeURIComponent(returnTo)}`}
                      key={event.id}
                    >
                      <span className="group-hover:text-foreground/70 leading-6 transition-colors">
                        {event.title}
                      </span>
                      <time
                        className="text-muted-foreground shrink-0 text-xs"
                        dateTime={event.lastPublishedAt}
                      >
                        {formatTime(event.lastPublishedAt)}
                      </time>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <details className="border-t pt-5">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                关于来源与整理方式
              </summary>
              <p className="text-muted-foreground mt-3 max-w-2xl text-xs leading-6">
                媒体数量按去除识别到的转载稿后统计；摘要可能依据报道正文或公开摘要整理。请通过每篇报道的原文链接核对完整语境。
              </p>
            </details>
          </div>
        </div>
      </main>
    </div>
  );
}

function ArticleCard({
  article,
  event,
}: {
  article: NewsArticle;
  event: NewsEventSummary;
}) {
  return (
    <article id={`source-${article.id}`} className="scroll-mt-20 border-b py-5">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <SourceIdentity name={article.sourceName} />
        <span>·</span>
        <time dateTime={article.publishedAt}>
          {new Date(article.publishedAt).toLocaleString("zh-CN")}
        </time>
        {(article.isReprint || article.evidenceLevel === "summary") && (
          <span className="text-muted-foreground">
            {article.isReprint ? "转载" : "仅摘要"}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-lg font-semibold">{article.title}</h3>
      {article.summary && (
        <p className="text-muted-foreground mt-2 text-sm leading-7">
          {article.summary}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-5">
        {article.urlStatus === "unreachable" ? (
          <span className="text-muted-foreground text-sm">原文暂不可访问</span>
        ) : (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-4"
          >
            打开原文
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          href={createNewsArticleFollowUpHref(event, article)}
        >
          <MessageCircleQuestionMarkIcon className="size-4" />
          围绕此报道提问
        </Link>
      </div>
    </article>
  );
}

function SourceLink({ article, id }: { article?: NewsArticle; id: string }) {
  return (
    <a
      href={`#source-${id}`}
      className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
    >
      {article
        ? `${article.sourceName} · ${truncateLabel(article.title, 22)}`
        : "来源"}
    </a>
  );
}

function EvidenceLabel({
  count,
  kind,
}: {
  count: number;
  kind: NewsClaim["evidenceKind"];
}) {
  const label =
    kind === "corroborated"
      ? `${count} 个独立来源确认`
      : kind === "single_source"
        ? "单一来源"
        : "来源待核对";
  return (
    <span
      className={cn(
        "shrink-0 text-xs",
        kind === "corroborated"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function truncateLabel(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function StateCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card className="text-muted-foreground flex-row items-center gap-3 p-7">
      {icon}
      <span>{text}</span>
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 md:grid-cols-2">
      <div className="bg-muted h-96 rounded-xl" />
      <div className="bg-muted h-96 rounded-xl" />
    </div>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60 * 60 * 1000)
    return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000)
    return `${Math.floor(diff / 3600000)} 小时前`;
  return date.toLocaleDateString("zh-CN");
}
