"use client";

import {
  Download,
  FileJson,
  FileText,
  MessagesSquareIcon,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { resetThreadChatAfterDelete } from "@/components/workspace/chats/use-thread-chat";
import { getAPIClient } from "@/core/api";
import { writeTextToClipboard } from "@/core/clipboard";
import { useI18n } from "@/core/i18n/hooks";
import {
  exportThreadAsJSON,
  exportThreadAsMarkdown,
} from "@/core/threads/export";
import {
  useDeleteThread,
  useInfiniteThreads,
  useRenameThread,
} from "@/core/threads/hooks";
import type { AgentThread, AgentThreadState } from "@/core/threads/types";
import {
  channelSourceOfThread,
  pathOfThread,
  titleOfThread,
} from "@/core/threads/utils";
import { env } from "@/env";
import { isIMEComposing } from "@/lib/ime";
import { cn } from "@/lib/utils";

import { ThreadChannelIcon } from "./thread-channel-source";

export function ConversationRecords({
  className,
}: {
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { thread_id: threadIdFromPath, agent_name: agentNameFromPath } =
    useParams<{
      thread_id: string;
      agent_name?: string;
    }>();
  const {
    data: infiniteThreads,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteThreads();
  const threads = useMemo(
    () => infiniteThreads?.pages.flat() ?? [],
    [infiniteThreads],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (
        target.closest(
          "[data-slot='dropdown-menu-content'], [data-slot='dialog-content']",
        )
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = sentinelRef.current;
    if (!element || !hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "120px 0px 120px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, open]);

  const { mutate: deleteThread } = useDeleteThread();
  const { mutate: renameThread } = useRenameThread();

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleDelete = useCallback(
    (thread: AgentThread) => {
      const currentPathname =
        typeof window === "undefined" ? pathname : window.location.pathname;
      const threadPath = pathOfThread(thread);
      const nextThreadPath = pathOfThread("new", {
        agent_name: agentNameFromPath,
      });
      const isNewThreadPath = currentPathname === nextThreadPath;
      const isCurrentThread =
        thread.thread_id === threadIdFromPath ||
        threadPath === currentPathname ||
        (isNewThreadPath && threads[0]?.thread_id === thread.thread_id);

      deleteThread({
        threadId: thread.thread_id,
        onRemoteDeleted: isCurrentThread
          ? () => {
              resetThreadChatAfterDelete({
                deletedThreadId: thread.thread_id,
                nextPath: nextThreadPath,
                force: true,
              });
              void router.replace(nextThreadPath);
            }
          : undefined,
      });
    },
    [
      agentNameFromPath,
      deleteThread,
      pathname,
      router,
      threadIdFromPath,
      threads,
    ],
  );

  const handleRenameClick = useCallback(
    (threadId: string, currentTitle: string) => {
      setRenameThreadId(threadId);
      setRenameValue(currentTitle);
      setRenameDialogOpen(true);
    },
    [],
  );

  const handleRenameSubmit = useCallback(() => {
    if (renameThreadId && renameValue.trim()) {
      renameThread({ threadId: renameThreadId, title: renameValue.trim() });
      setRenameDialogOpen(false);
      setRenameThreadId(null);
      setRenameValue("");
    }
  }, [renameThread, renameThreadId, renameValue]);

  const handleShare = useCallback(
    async (thread: AgentThread) => {
      const shareUrl = `${window.location.origin}${pathOfThread(thread)}`;
      try {
        const didCopy = await writeTextToClipboard(shareUrl);
        if (!didCopy) {
          toast.error(t.clipboard.failedToCopyToClipboard);
          return;
        }

        toast.success(t.clipboard.linkCopied);
      } catch {
        toast.error(t.clipboard.failedToCopyToClipboard);
      }
    },
    [t],
  );

  const handleExport = useCallback(
    async (thread: AgentThread, format: "markdown" | "json") => {
      try {
        const apiClient = getAPIClient();
        const state = await apiClient.threads.getState<AgentThreadState>(
          thread.thread_id,
        );
        const messages = state.values?.messages ?? [];
        if (messages.length === 0) {
          toast.error(t.conversation.noMessages);
          return;
        }
        if (format === "markdown") {
          exportThreadAsMarkdown(thread, messages);
        } else {
          exportThreadAsJSON(thread, messages);
        }
        toast.success(t.common.exportSuccess);
      } catch {
        toast.error("Failed to export conversation");
      }
    },
    [t],
  );

  return (
    <div ref={panelRef} className={cn("relative", className)}>
      <Button
        aria-expanded={open}
        className="h-8 gap-1.5 rounded-full px-3 text-[#0B2A5B] hover:bg-[#EBF2FF]"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <MessagesSquareIcon className="size-4" />
        {t.sidebar.recentChats}
      </Button>
      {open ? (
        <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#0B2A5B]/10 bg-white shadow-[0_20px_60px_rgba(11,42,91,0.12)]">
          <div className="border-b border-[#0B2A5B]/8 px-4 py-3">
            <p className="text-sm font-medium text-[#0B2A5B]">
              {t.sidebar.recentChats}
            </p>
            <p className="mt-0.5 text-[11px] text-[#0B2A5B]/45">
              {threads.length === 0
                ? "还没有保存的对话"
                : `共 ${threads.length} 条`}
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {threads.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-[#0B2A5B]/50">
                发送第一条消息后，记录会出现在这里
              </p>
            ) : null}
            {threads.map((thread) => {
              const isActive = pathOfThread(thread) === pathname;
              const channelSource = channelSourceOfThread(thread);
              return (
                <div
                  className={cn(
                    "group/record flex items-center gap-1 px-1.5",
                    isActive && "bg-[#EBF2FF]",
                  )}
                  key={thread.thread_id}
                >
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#0B2A5B] hover:bg-[#F7FBFF]"
                    href={pathOfThread(thread)}
                    onClick={() => setOpen(false)}
                  >
                    <ThreadChannelIcon source={channelSource} />
                    <span className="min-w-0 truncate">
                      {titleOfThread(thread)}
                    </span>
                  </Link>
                  {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY !== "true" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t.common.more}
                          className="size-7 opacity-0 group-hover/record:opacity-100"
                          size="icon-sm"
                          variant="ghost"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-48 rounded-lg"
                        side="right"
                      >
                        <DropdownMenuItem
                          onSelect={() =>
                            handleRenameClick(
                              thread.thread_id,
                              titleOfThread(thread),
                            )
                          }
                        >
                          <Pencil className="text-muted-foreground" />
                          <span>{t.common.rename}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleShare(thread)}>
                          <Share2 className="text-muted-foreground" />
                          <span>{t.common.share}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Download className="text-muted-foreground" />
                            <span>{t.common.export}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem
                              onSelect={() => handleExport(thread, "markdown")}
                            >
                              <FileText className="text-muted-foreground" />
                              <span>{t.common.exportAsMarkdown}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => handleExport(thread, "json")}
                            >
                              <FileJson className="text-muted-foreground" />
                              <span>{t.common.exportAsJSON}</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => handleDelete(thread)}
                        >
                          <Trash2 className="text-muted-foreground" />
                          <span>{t.common.delete}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
            {hasNextPage && (
              <>
                <Button
                  className="mx-2 my-1 w-[calc(100%-1rem)] justify-center text-xs"
                  data-testid="recent-chat-list-load-more"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  size="sm"
                  variant="ghost"
                >
                  {isFetchingNextPage
                    ? t.chats.loadingMore
                    : t.chats.loadOlderChats}
                </Button>
                <div
                  aria-hidden="true"
                  className="h-px w-full"
                  data-testid="recent-chat-list-sentinel"
                  ref={sentinelRef}
                />
              </>
            )}
          </div>
        </div>
      ) : null}

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t.common.rename}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={t.common.rename}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isIMEComposing(e)) {
                  e.preventDefault();
                  handleRenameSubmit();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button onClick={handleRenameSubmit}>{t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const RecentChatList = ConversationRecords;
