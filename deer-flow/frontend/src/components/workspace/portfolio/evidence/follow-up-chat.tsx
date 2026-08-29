"use client";

import { CornerDownLeftIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";

import type { EvidenceEntry } from "@/core/portfolio/evidence-pack";
import {
  streamInsightFollowUp,
  type FollowUpHistoryItem,
} from "@/core/portfolio/insights-api";

import { AiMarkdown } from "./ai-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

export function FollowUpChat({
  packId,
  index,
}: {
  packId: string | null;
  index: Map<string, EvidenceEntry>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const submit = async () => {
    const question = draft.trim();
    if (!question || sending || !packId) return;
    const history: FollowUpHistoryItem[] = messages
      .filter((message) => !message.error)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));
    setDraft("");
    setSending(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    await streamInsightFollowUp(
      { pack_id: packId, question, history },
      {
        onAiDelta: (text) => {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + text };
            }
            return next;
          });
          window.requestAnimationFrame(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
          });
        },
        onError: (message) => {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                role: "assistant",
                content: message,
                error: true,
              };
            }
            return next;
          });
        },
        onDone: () => setSending(false),
      },
    );
    setSending(false);
  };

  if (!packId) return null;

  return (
    <section>
      <div className="border-border flex items-baseline justify-between border-t pt-3">
        <span className="text-muted-foreground text-[10px] font-bold tracking-[0.18em] uppercase">
          追问
        </span>
        <span className="text-muted-foreground text-[11px]">
          回答仍锚定同一份证据包
        </span>
      </div>

      {messages.length > 0 ? (
        <div ref={listRef} className="max-h-80 space-y-4 overflow-y-auto py-4">
          {messages.map((message, position) =>
            message.role === "user" ? (
              <div key={position} className="flex justify-end">
                <div className="bg-foreground text-background max-w-[80%] rounded-lg px-3.5 py-2 text-sm leading-6">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={position} className="border-border flex justify-start gap-3">
                <span className="bg-border mt-1 w-px shrink-0 self-stretch" />
                <div className="max-w-[92%] text-sm">
                  {message.content ? (
                    <AiMarkdown text={message.content} index={index} />
                  ) : (
                    <Loader2Icon className="text-foreground/50 size-4 animate-spin" />
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      <div className="border-border flex items-end gap-2 border-t px-4 py-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder="例如：最大贡献标的的亏损主要来自持仓还是交易？"
          className="border-border focus-visible:ring-foreground/20 max-h-28 min-h-10 flex-1 resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || !draft.trim()}
          className="bg-foreground text-background flex size-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CornerDownLeftIcon className="size-4" />
          )}
        </button>
      </div>
    </section>
  );
}
