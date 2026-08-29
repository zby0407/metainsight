"use client";

import { LoaderIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EvidencePack, InsightPackType } from "@/core/portfolio/evidence-pack";
import {
  streamInsightFollowUp,
  streamInsightGenerate,
  type InsightGenerateBody,
} from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { AiMarkdown } from "./ai-markdown";
import { useEvidenceIndex } from "./citation-text";
import { EvidenceRail } from "./evidence-rail";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Right-rail panel that keeps the deterministic evidence ledger and the AI
 * conversation in one place. The main column stays focused on parameters and
 * results; interpretation and follow-ups live here instead of being appended
 * to the page flow. */
export interface AiFocus {
  id: string;
  label: string;
  detail: string;
}

export function AiSidePanel({
  pack,
  packType,
  buildAiBody,
  openSignal = 0,
  ready = true,
  readyHint,
  focus = null,
  onClearFocus,
}: {
  pack: EvidencePack | null;
  packType: InsightPackType;
  buildAiBody: () => InsightGenerateBody;
  /** Increment to open the assistant tab and start generating. */
  openSignal?: number;
  ready?: boolean;
  readyHint?: string;
  /** Clicking a result row focuses the assistant on that item. */
  focus?: AiFocus | null;
  onClearFocus?: () => void;
}) {
  const [tab, setTab] = useState<"evidence" | "assistant">("evidence");
  const [aiText, setAiText] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiPackId, setAiPackId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const index = useEvidenceIndex(pack);
  const canGenerate = ready && pack != null;

  const generate = useCallback(() => {
    if (!canGenerate) return;
    setTab("assistant");
    setAiRunning(true);
    setAiText("");
    setTurns([]);
    setAiPackId(null);
    void streamInsightGenerate(packType, buildAiBody(), {
      onAiDelta: (text) => setAiText((current) => current + text),
      onError: (message) => {
        setAiText(`AI 解读失败：${message}`);
        setAiRunning(false);
      },
      onDone: (info) => {
        setAiRunning(false);
        if (info.pack_id) setAiPackId(info.pack_id);
      },
    });
  }, [buildAiBody, canGenerate, packType]);

  // External trigger (toolbar button) opens the assistant and starts streaming.
  const lastSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== lastSignal.current) {
      lastSignal.current = openSignal;
      generate();
    }
  }, [openSignal, generate]);

  const ask = useCallback(() => {
    const text = question.trim();
    if (!text || !aiPackId || asking) return;
    setQuestion("");
    setAsking(true);
    const scoped = focus
      ? `【针对${focus.label}（${focus.detail}）】${text}`
      : text;
    setTurns((current) => [
      ...current,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    const history = turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
    void streamInsightFollowUp(
      { pack_id: aiPackId, question: scoped, history },
      {
        onAiDelta: (delta) =>
          setTurns((current) => {
            const next = [...current];
            const last = next.at(-1);
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          }),
        onError: (message) =>
          setTurns((current) => {
            const next = [...current];
            const last = next.at(-1);
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: `追问失败：${message}` };
            }
            return next;
          }),
        onDone: () => setAsking(false),
      },
    );
  }, [aiPackId, asking, question, turns, focus]);

  // Clicking a result row switches the assistant into that item's context.
  useEffect(() => {
    if (focus) setTab("assistant");
  }, [focus]);

  // Citation chips scroll the ledger even when it sits on the other tab.
  const handleCite = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-evidence-id]",
    );
    const id = target?.dataset.evidenceId;
    if (!id) return;
    setTab("evidence");
    setHighlightId(id);
  }, []);

  useEffect(() => {
    if (tab !== "evidence" || !highlightId) return;
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`evidence-${highlightId}`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add("ring-2", "ring-[#c9a86a]");
      window.setTimeout(() => node.classList.remove("ring-2", "ring-[#c9a86a]"), 1600);
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, highlightId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turns, aiText]);

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={handleCite}>
      <div className="border-border flex border-b">
        <button
          type="button"
          onClick={() => setTab("evidence")}
          className={cn(
            "flex-1 px-4 py-3 text-xs font-medium transition-colors",
            tab === "evidence"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          证据
        </button>
        <button
          type="button"
          onClick={() => setTab("assistant")}
          className={cn(
            "flex-1 px-4 py-3 text-xs font-medium transition-colors",
            tab === "assistant"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          AI 助手
        </button>
      </div>

      {tab === "evidence" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <EvidenceRail pack={pack} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {focus ? (
            <div className="border-border bg-muted/40 flex items-start gap-2 border-b px-4 py-2.5">
              <span className="text-muted-foreground shrink-0 text-[10px] font-bold tracking-[0.18em] uppercase">
                聚焦
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate text-xs font-medium">{focus.label}</div>
                <div className="text-muted-foreground truncate text-[11px]">{focus.detail}</div>
              </div>
              {onClearFocus ? (
                <button
                  type="button"
                  onClick={onClearFocus}
                  className="text-muted-foreground hover:text-foreground shrink-0 text-[11px] transition-colors"
                >
                  取消
                </button>
              ) : null}
            </div>
          ) : null}

          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!canGenerate ? (
              <p className="text-muted-foreground text-xs leading-6">
                {readyHint ?? "先生成证据包，再让 AI 基于证据解读。"}
              </p>
            ) : !aiText && !aiRunning ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs leading-6">
                  基于左侧证据包生成解读，只引用包内事实与规则，不做包外推断。生成后可继续追问。
                </p>
                <button
                  type="button"
                  onClick={generate}
                  className="bg-foreground text-background flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                >
                  <SparklesIcon className="size-4" />
                  生成解读
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border-[#c9a86a] border-l-2 pl-3 text-xs leading-6">
                  <AiMarkdown text={aiText} index={index} />
                </div>
                {turns.map((turn, position) =>
                  turn.role === "user" ? (
                    <p key={`q-${position}`} className="text-foreground text-xs leading-6">
                      你：{turn.content}
                    </p>
                  ) : (
                    <div key={`a-${position}`} className="border-[#c9a86a] border-l-2 pl-3 text-xs leading-6">
                      <AiMarkdown text={turn.content} index={index} />
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {aiText && !aiRunning && aiPackId ? (
            <div className="border-border flex items-center gap-2 border-t p-3">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") ask();
                }}
                placeholder={focus ? `针对${focus.label}追问…` : "就这份证据追问…"}
                className="border-border focus-visible:ring-foreground/20 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2"
              />
              <button
                type="button"
                onClick={ask}
                disabled={!question.trim() || asking}
                className="border-border hover:bg-muted rounded-md border px-2.5 py-1.5 transition-colors disabled:opacity-40"
                aria-label="发送追问"
              >
                {asking ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <SendIcon className="size-3.5" />
                )}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
