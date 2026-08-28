"use client";

import {
  BellIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { useNotification } from "@/core/notification/hooks";
import { cn } from "@/lib/utils";

interface ResearchNotification {
  id: string;
  kind: string;
  severity: "normal" | "important" | "critical";
  symbol: string | null;
  title: string;
  body: string;
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationPage {
  items: ResearchNotification[];
  unreadCount: number;
}

async function readPage() {
  const response = await fetchWithAuth("/api/v1/notifications?limit=30");
  if (!response.ok) throw new Error(`通知加载失败：${response.status}`);
  return (await response.json()) as NotificationPage;
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ResearchNotificationCenter({
  isSidebarOpen,
}: {
  isSidebarOpen: boolean;
}) {
  const router = useRouter();
  const { showNotification } = useNotification();
  const [page, setPage] = useState<NotificationPage>({
    items: [],
    unreadCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const initialLoad = useRef(true);
  const knownIds = useRef(new Set<string>());

  const load = useCallback(
    async (announce = false) => {
      try {
        const next = await readPage();
        if (announce && !initialLoad.current) {
          const incoming = next.items.find(
            (item) => !item.readAt && !knownIds.current.has(item.id),
          );
          if (incoming) {
            toast(incoming.title, { description: incoming.body });
            if (document.visibilityState !== "visible") {
              showNotification(
                incoming.title,
                {
                  body: incoming.body,
                  tag: incoming.id,
                  data: { targetUrl: incoming.targetUrl },
                },
                () => {
                  if (incoming.targetUrl?.startsWith("/")) {
                    const [path, hash] = incoming.targetUrl.split("#");
                    router.push(path);
                    if (hash) {
                      window.setTimeout(() => {
                        document
                          .getElementById(hash)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }, 350);
                    }
                  }
                },
              );
            }
          }
        }
        next.items.forEach((item) => knownIds.current.add(item.id));
        initialLoad.current = false;
        setPage(next);
      } catch (error) {
        if (initialLoad.current) {
          console.warn("Notification center unavailable", error);
        }
      } finally {
        setLoading(false);
      }
    },
    [router, showNotification],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(
      () => void load(true),
      menuOpen ? 8_000 : 20_000,
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, menuOpen]);

  const openNotification = async (item: ResearchNotification) => {
    if (!item.readAt) {
      const response = await fetchWithAuth(
        `/api/v1/notifications/${encodeURIComponent(item.id)}/read`,
        { method: "POST" },
      );
      if (response.ok) {
        setPage((current) => ({
          unreadCount: Math.max(0, current.unreadCount - 1),
          items: current.items.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, readAt: new Date().toISOString() }
              : candidate,
          ),
        }));
      }
    }
    if (item.targetUrl?.startsWith("/")) {
      const [path, hash] = item.targetUrl.split("#");
      router.push(path);
      if (hash) {
        window.setTimeout(() => {
          document
            .getElementById(hash)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 350);
      }
    }
  };

  const markAllRead = async () => {
    const response = await fetchWithAuth("/api/v1/notifications/read-all", {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("全部标为已读失败");
      return;
    }
    const readAt = new Date().toISOString();
    setPage((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? readAt,
      })),
    }));
  };

  const badge = page.unreadCount > 99 ? "99+" : String(page.unreadCount);

  return (
    <SidebarMenuItem>
      <DropdownMenu
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) void load();
        }}
      >
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            aria-label={`通知${page.unreadCount ? `，${page.unreadCount} 条未读` : ""}`}
            className="relative"
            size="lg"
          >
            <span className="relative flex size-5 items-center justify-center">
              <BellIcon className="text-sidebar-foreground/80 size-4" />
              {page.unreadCount ? (
                <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-4">
                  {badge}
                </span>
              ) : null}
            </span>
            {isSidebarOpen ? (
              <span className="flex min-w-0 flex-1 items-center">
                <span>通知</span>
                {page.unreadCount ? (
                  <span className="text-sidebar-foreground/60 ml-auto text-xs">
                    {page.unreadCount} 条未读
                  </span>
                ) : null}
              </span>
            ) : null}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[min(390px,calc(100vw-24px))] border-[#dce8fa] bg-white p-0 text-[#0b2a5b] shadow-[0_16px_48px_rgba(11,42,91,0.12)]"
          sideOffset={6}
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold">通知</p>
              <p className="text-muted-foreground text-[11px]">
                研究结果和关注动态会出现在这里
              </p>
            </div>
            {page.unreadCount ? (
              <Button
                onClick={() => void markAllRead()}
                size="sm"
                variant="ghost"
              >
                <CheckCheckIcon />
                全部已读
              </Button>
            ) : null}
          </div>
          <DropdownMenuSeparator className="m-0" />
          <div className="max-h-[430px] overflow-y-auto p-1">
            {loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-10 text-xs">
                <Loader2Icon className="size-4 animate-spin" />
                正在加载通知
              </div>
            ) : page.items.length ? (
              page.items.map((item) => (
                <DropdownMenuItem
                  className={cn(
                    "mb-0.5 cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-[#0b2a5b] focus:bg-[#eaf2ff] focus:text-[#0b2a5b]",
                    !item.readAt && "bg-[#eaf2ff]",
                  )}
                  key={item.id}
                  onClick={() => void openNotification(item)}
                >
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      item.readAt ? "bg-[#b7c8e6]" : "bg-[#1e6bff]",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className="line-clamp-1 flex-1 text-xs font-medium">
                        {item.title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[10px]">
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-4">
                      {item.body}
                    </span>
                    {item.targetUrl ? (
                      <span className="text-primary mt-1.5 flex items-center gap-1 text-[10px] font-medium">
                        {item.kind === "news_topic_update"
                          ? "查看动态"
                          : "查看研究"}{" "}
                        <ExternalLinkIcon className="size-2.5" />
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-4 py-10 text-center">
                <BellIcon className="text-muted-foreground mx-auto size-5" />
                <p className="mt-2 text-xs font-medium">暂无通知</p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  研究结果和你关注的新闻动态会送达这里
                </p>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
