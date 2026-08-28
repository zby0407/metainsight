"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  type PromptInputMessage,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { NewsChatContextCard } from "@/components/news/news-chat-context-card";
import {
  NewsChatPromptSuggestions,
  NewsChatWelcomeHeader,
} from "@/components/news/news-chat-welcome";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import {
  ChatBox,
  useSpecificChatMode,
  useThreadChat,
} from "@/components/workspace/chats";
import { ExportTrigger } from "@/components/workspace/export-trigger";
import { InputBox } from "@/components/workspace/input-box";
import {
  MessageList,
  MESSAGE_LIST_DEFAULT_PADDING_BOTTOM,
} from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ConversationRecords } from "@/components/workspace/recent-chat-list";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { TodoList } from "@/components/workspace/todo-list";
import { TokenUsageIndicator } from "@/components/workspace/token-usage-indicator";
import { Welcome } from "@/components/workspace/welcome";
import { normalizeAgentChatPrompt } from "@/core/agents";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  buildNewsContextMessage,
  NEWS_FOLLOW_UP_QUERY_KEYS,
  readNewsFollowUpContext,
} from "@/core/finance/news";
import {
  formatRiskProfilePreference,
  readStoredRiskProfile,
} from "@/core/finance/risk-profile";
import {
  buildPortfolioWorkflowDisplayLabel,
  buildPortfolioWorkflowPrompt,
  portfolioWorkflowThreadDisplayTitle,
  readPortfolioWorkflowDisplay,
  type PortfolioWorkflowKind,
} from "@/core/finance/workflows";
import { useI18n } from "@/core/i18n/hooks";
import { useModels } from "@/core/models/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useLocalSettings, useThreadSettings } from "@/core/settings";
import {
  useThreadMetadata,
  useRenameThread,
  useThreadStream,
  useThreadTokenUsage,
} from "@/core/threads/hooks";
import { threadTokenUsageToTokenUsage } from "@/core/threads/token-usage";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const promptInputController = usePromptInputController();
  const { threadId, setThreadId, isNewThread, setIsNewThread, isMock } =
    useThreadChat();
  // `isNewThread` tracks whether the backend has the thread yet — gates the
  // SDK's history fetch (see issue #2746).  `isWelcomeMode` is the visual
  // welcome layout (centered input, hero, quick actions); we flip it to false
  // the moment the user submits so the UI animates immediately, even though
  // `isNewThread` stays true until the backend actually creates the thread.
  const [isWelcomeMode, setIsWelcomeMode] = useState(isNewThread);
  const [settings, setSettings] = useThreadSettings(threadId);
  const [localSettings, setLocalSettings] = useLocalSettings();
  const { tokenUsageEnabled } = useModels();
  const threadTokenUsage = useThreadTokenUsage(
    isNewThread || isMock ? undefined : threadId,
    { enabled: tokenUsageEnabled && !isMock },
  );
  const threadMetadata = useThreadMetadata(threadId, {
    enabled: !isNewThread && !isMock,
    isMock,
  });
  const backendTokenUsage = threadTokenUsageToTokenUsage(threadTokenUsage.data);
  const mountedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const migratedWorkflowTitleRef = useRef("");
  const autoRunRequest = useMemo(() => {
    if (
      !isNewThread ||
      searchParams.get("source") !== "investment-agent" ||
      searchParams.get("autostart") !== "1"
    ) {
      return null;
    }
    const portfolioId =
      searchParams.get("portfolioId")?.trim().slice(0, 64) ?? "";
    const workflowKind = searchParams.get("workflowKind");
    const requestedPortfolioName = normalizeAgentChatPrompt(
      searchParams.get("portfolioName"),
      80,
    );
    const legacyPrompt = normalizeAgentChatPrompt(searchParams.get("prompt"));
    const locale = normalizeAgentChatPrompt(searchParams.get("locale"), 16);
    if (
      !portfolioId ||
      !workflowKind ||
      !["review", "risk", "strategy", "sandbox"].includes(workflowKind)
    ) {
      return null;
    }
    const legacyDisplay = readPortfolioWorkflowDisplay(legacyPrompt, {
      investment_workspace: {
        workflow_kind: workflowKind,
        portfolio_id: portfolioId,
      },
    });
    const portfolioName = requestedPortfolioName
      ? requestedPortfolioName
      : (legacyDisplay?.portfolioName ?? "");
    if (!portfolioName) return null;
    const storedProfile = user?.id ? readStoredRiskProfile(user.id) : null;
    const request = {
      portfolio: { id: portfolioId, name: portfolioName },
      kind: workflowKind as PortfolioWorkflowKind,
      locale: locale ? locale : "zh-CN",
      investorPreference: storedProfile
        ? formatRiskProfilePreference(storedProfile, locale || "zh-CN")
        : undefined,
    };
    return {
      portfolioId,
      portfolioName,
      workflowKind: request.kind,
      prompt: legacyPrompt || buildPortfolioWorkflowPrompt(request),
      displayLabel: buildPortfolioWorkflowDisplayLabel(request),
    };
  }, [isNewThread, searchParams, user?.id]);
  const newsFollowUpContext = useMemo(
    () => (isNewThread ? readNewsFollowUpContext(searchParams) : null),
    [isNewThread, searchParams],
  );
  const isNewsWelcomeMode = isWelcomeMode && newsFollowUpContext !== null;
  useSpecificChatMode();

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  // Keep welcome layout in sync when navigating between threads (sidebar
  // clicks, "new chat" button).  Submitting in /chats/new flips the layout
  // via onSend below — `isNewThread` stays true until onStart, so this effect
  // is harmless during the submit transition.
  useEffect(() => {
    setIsWelcomeMode(isNewThread);
  }, [isNewThread]);

  const { showNotification } = useNotification();
  const { mutate: renameThread } = useRenameThread();

  const {
    thread,
    pendingUsageMessages,
    sendMessage,
    isUploading,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
  } = useThreadStream({
    threadId: isNewThread ? undefined : threadId,
    displayThreadId: threadId,
    context: settings.context,
    isMock,
    // onSend only animates the UI; do NOT flip `isNewThread` here — the
    // LangGraph SDK eagerly fetches /history the moment it receives a
    // thread id and assumes the thread exists on the backend (issue #2746).
    onSend: () => {
      setIsWelcomeMode(false);
    },
    onStart: (createdThreadId) => {
      // ! Important: Never use next.js router for navigation in this case, otherwise it will cause the thread to re-mount and lose all states. Use native history API instead.
      history.replaceState(null, "", `/workspace/chats/${createdThreadId}`);
      setThreadId(createdThreadId);
      setIsNewThread(false);
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages.at(-1);
        if (lastMessage) {
          const textContent = textOfMessage(lastMessage);
          if (textContent) {
            body =
              textContent.length > 200
                ? textContent.substring(0, 200) + "..."
                : textContent;
          }
        }
        showNotification(state.title, { body });
      }
    },
  });

  const hasThreadMessages = thread.messages.length > 0;

  useEffect(() => {
    if (
      !autoRunRequest ||
      autoSubmittedRef.current ||
      isMock ||
      isHistoryLoading ||
      isUploading ||
      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"
    ) {
      return;
    }

    if (settings.context.mode !== "pro") {
      setSettings("context", {
        mode: "pro",
        reasoning_effort:
          settings.context.reasoning_effort === "high" ? "high" : "medium",
      });
      return;
    }

    autoSubmittedRef.current = true;
    promptInputController.textInput.setInput("");

    const investmentWorkspace = {
      workflow_id: threadId,
      workflow_kind: autoRunRequest.workflowKind,
      portfolio_id: autoRunRequest.portfolioId,
      portfolio_name: autoRunRequest.portfolioName,
      display_label: autoRunRequest.displayLabel,
      trigger_source: "investment-agent-workspace",
    };
    const cleanURL = new URL(window.location.href);
    for (const key of [
      "prompt",
      "source",
      "autostart",
      "mode",
      "portfolioId",
      "portfolioName",
      "workflowKind",
      "locale",
    ]) {
      cleanURL.searchParams.delete(key);
    }
    history.replaceState(
      null,
      "",
      `${cleanURL.pathname}${cleanURL.search}${cleanURL.hash}`,
    );

    void sendMessage(
      threadId,
      { text: autoRunRequest.prompt, files: [] },
      { investment_workspace: investmentWorkspace },
      { additionalKwargs: { investment_workspace: investmentWorkspace } },
    ).catch((error: unknown) => {
      promptInputController.textInput.setInput(autoRunRequest.prompt);
      toast.error(
        error instanceof Error
          ? error.message
          : "The Agent workflow could not be started.",
      );
    });
  }, [
    autoRunRequest,
    isHistoryLoading,
    isMock,
    isUploading,
    promptInputController.textInput,
    sendMessage,
    setSettings,
    settings.context.mode,
    settings.context.reasoning_effort,
    threadId,
  ]);

  const workflowDisplayTitle = useMemo(
    () =>
      portfolioWorkflowThreadDisplayTitle(
        thread.values?.title,
        thread.messages,
      ),
    [thread.messages, thread.values?.title],
  );

  useEffect(() => {
    const currentTitle = thread.values?.title;
    const migrationKey = `${threadId}:${workflowDisplayTitle ?? ""}`;
    if (
      isNewThread ||
      isMock ||
      !workflowDisplayTitle ||
      workflowDisplayTitle === currentTitle ||
      migratedWorkflowTitleRef.current === migrationKey
    ) {
      return;
    }

    migratedWorkflowTitleRef.current = migrationKey;
    renameThread({ threadId, title: workflowDisplayTitle });
  }, [
    isMock,
    isNewThread,
    renameThread,
    thread.values?.title,
    threadId,
    workflowDisplayTitle,
  ]);

  useEffect(() => {
    if (
      !isNewThread &&
      !isMock &&
      threadMetadata.data === null &&
      !threadMetadata.isLoading &&
      !threadMetadata.isFetching &&
      !isHistoryLoading &&
      !hasMoreHistory &&
      !hasThreadMessages
    ) {
      router.replace("/workspace/chats/new");
    }
  }, [
    hasMoreHistory,
    hasThreadMessages,
    isHistoryLoading,
    isMock,
    isNewThread,
    router,
    threadMetadata.data,
    threadMetadata.isFetching,
    threadMetadata.isLoading,
  ]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const outgoingMessage = newsFollowUpContext
        ? {
            ...message,
            text: buildNewsContextMessage(newsFollowUpContext, message.text),
          }
        : message;
      if (newsFollowUpContext) {
        const cleanURL = new URL(window.location.href);
        for (const key of NEWS_FOLLOW_UP_QUERY_KEYS) {
          cleanURL.searchParams.delete(key);
        }
        history.replaceState(
          null,
          "",
          `${cleanURL.pathname}${cleanURL.search}${cleanURL.hash}`,
        );
      }
      const sendPromise = sendMessage(
        threadId,
        outgoingMessage,
        undefined,
        newsFollowUpContext
          ? { additionalKwargs: { news_context: newsFollowUpContext } }
          : undefined,
      );
      if (message.files.length > 0) {
        return sendPromise;
      }
      void sendPromise;
    },
    [newsFollowUpContext, sendMessage, threadId],
  );
  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);
  const handleNewsPromptSelect = useCallback(
    (prompt: string) => {
      promptInputController.textInput.setInput(prompt);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLTextAreaElement>("textarea[name='message']")
          ?.focus();
      });
    },
    [promptInputController.textInput],
  );

  const tokenUsageInlineMode = tokenUsageEnabled
    ? localSettings.tokenUsage.inlineMode
    : "off";
  const hasTodos = (thread.values.todos?.length ?? 0) > 0;

  return (
    <ThreadContext.Provider value={{ thread, isMock }}>
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center gap-2 px-2 sm:px-4",
              isWelcomeMode
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <SidebarTrigger className="md:hidden" />
            {(!isWelcomeMode || isNewsWelcomeMode) && <ConversationRecords />}
            <div className="flex min-w-0 flex-1 items-center text-sm font-medium">
              <ThreadTitle threadId={threadId} thread={thread} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TokenUsageIndicator
                threadId={isNewThread ? undefined : threadId}
                backendUsage={backendTokenUsage}
                enabled={tokenUsageEnabled}
                messages={thread.messages}
                pendingMessages={pendingUsageMessages}
                preferences={localSettings.tokenUsage}
                onPreferencesChange={(preferences) =>
                  setLocalSettings("tokenUsage", preferences)
                }
              />
              <ExportTrigger threadId={threadId} />
              <ArtifactTrigger />
            </div>
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex min-h-0 flex-1 justify-center">
              <MessageList
                className={cn("size-full", !isWelcomeMode && "pt-10")}
                threadId={threadId}
                thread={thread}
                paddingBottom={MESSAGE_LIST_DEFAULT_PADDING_BOTTOM}
                hasMoreHistory={hasMoreHistory}
                loadMoreHistory={loadMoreHistory}
                isHistoryLoading={isHistoryLoading}
                tokenUsageInlineMode={tokenUsageInlineMode}
              />
            </div>
            <div
              className={cn(
                "right-0 bottom-0 left-0 z-30 flex justify-center px-3 sm:px-4",
                isWelcomeMode ? "absolute" : "relative shrink-0 pb-4",
                isNewsWelcomeMode && "top-12 overflow-y-auto py-6 sm:py-8",
              )}
            >
              <div
                className={cn(
                  isNewsWelcomeMode
                    ? "flex min-h-full w-full items-center justify-center"
                    : "contents",
                )}
              >
                <div
                  className={cn(
                    "relative w-full",
                    isWelcomeMode &&
                      !isNewsWelcomeMode &&
                      "-translate-y-[calc(50vh-48px)] sm:-translate-y-[calc(50vh-96px)]",
                    isNewsWelcomeMode
                      ? "max-w-2xl"
                      : isWelcomeMode
                        ? "max-w-(--container-width-sm)"
                        : "max-w-(--container-width-md)",
                  )}
                >
                  {isNewsWelcomeMode && (
                    <>
                      <NewsChatWelcomeHeader context={newsFollowUpContext} />
                      <NewsChatContextCard
                        className="mb-3 w-full"
                        context={newsFollowUpContext}
                      />
                    </>
                  )}
                  {hasTodos && (
                    <div
                      className={cn(
                        "right-0 left-0 z-0",
                        isWelcomeMode ? "absolute -top-4" : "relative",
                      )}
                    >
                      <div
                        className={cn(
                          "right-0 bottom-0 left-0",
                          isWelcomeMode ? "absolute" : "relative",
                        )}
                      >
                        <TodoList
                          className="bg-background/5"
                          todos={thread.values.todos ?? []}
                          hidden={false}
                        />
                      </div>
                    </div>
                  )}
                  {mountedRef.current ? (
                    <InputBox
                      className={cn(
                        "bg-background/5 w-full",
                        isWelcomeMode &&
                          !isNewsWelcomeMode &&
                          "-translate-y-2 sm:-translate-y-4",
                      )}
                      isWelcomeMode={isWelcomeMode}
                      threadId={threadId}
                      autoFocus={isWelcomeMode}
                      status={
                        thread.error
                          ? "error"
                          : thread.isLoading
                            ? "streaming"
                            : "ready"
                      }
                      context={settings.context}
                      extraHeader={
                        isWelcomeMode &&
                        !isNewsWelcomeMode && (
                          <div className="flex w-full flex-col items-stretch gap-1">
                            <div className="flex justify-start">
                              <ConversationRecords />
                            </div>
                            <Welcome mode={settings.context.mode} />
                          </div>
                        )
                      }
                      placeholder={
                        isNewsWelcomeMode
                          ? newsFollowUpContext.kind === "article"
                            ? "可以追问这篇报道的依据、观点或可信度…"
                            : "可以追问事件脉络、来源差异或潜在影响…"
                          : undefined
                      }
                      disabled={
                        isMock ||
                        env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                        isUploading
                      }
                      onContextChange={(context) =>
                        setSettings("context", context)
                      }
                      onSubmit={handleSubmit}
                      onStop={handleStop}
                      welcomeSuggestions={isNewsWelcomeMode ? false : undefined}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className={cn(
                        "bg-background/5 h-32 w-full rounded-2xl",
                        isWelcomeMode &&
                          !isNewsWelcomeMode &&
                          "-translate-y-2 sm:-translate-y-4",
                      )}
                    />
                  )}
                  {isNewsWelcomeMode && (
                    <NewsChatPromptSuggestions
                      context={newsFollowUpContext}
                      onSelect={handleNewsPromptSelect}
                    />
                  )}
                  {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                    <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                      {t.common.notAvailableInDemoMode}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}
