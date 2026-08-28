import type { BaseStream } from "@langchain/langgraph-sdk";
import { useEffect } from "react";

import { portfolioWorkflowThreadDisplayTitle } from "@/core/finance/workflows";
import { useI18n } from "@/core/i18n/hooks";
import type { AgentThreadState } from "@/core/threads";

import { useThreadChat } from "./chats";
import { FlipDisplay } from "./flip-display";

export function ThreadTitle({
  threadId,
  thread,
}: {
  className?: string;
  threadId: string;
  thread: BaseStream<AgentThreadState>;
}) {
  const { t } = useI18n();
  const { isNewThread } = useThreadChat();
  const displayTitle = portfolioWorkflowThreadDisplayTitle(
    thread.values?.title,
    thread.messages,
  );
  useEffect(() => {
    let _title = t.pages.untitled;

    if (displayTitle) {
      _title = displayTitle;
    } else if (isNewThread) {
      _title = t.pages.newChat;
    }
    if (thread.isThreadLoading) {
      document.title = `Loading... - ${t.pages.appName}`;
    } else {
      document.title = `${_title} - ${t.pages.appName}`;
    }
  }, [
    isNewThread,
    t.pages.newChat,
    t.pages.untitled,
    t.pages.appName,
    thread.isThreadLoading,
    displayTitle,
  ]);

  if (!displayTitle) {
    return null;
  }
  return <FlipDisplay uniqueKey={threadId}>{displayTitle}</FlipDisplay>;
}
