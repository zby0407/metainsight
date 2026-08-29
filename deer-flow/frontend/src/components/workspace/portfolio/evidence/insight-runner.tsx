"use client";

import { AlertTriangleIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { EvidencePack, InsightPackType } from "@/core/portfolio/evidence-pack";
import {
  streamInsightGenerate,
  type InsightComputedPayload,
  type InsightGenerateBody,
} from "@/core/portfolio/insights-api";
import { cn } from "@/lib/utils";

import { AiMarkdown } from "./ai-markdown";
import { useEvidenceIndex } from "./citation-text";
import { EvidenceRail } from "./evidence-rail";
import { FollowUpChat } from "./follow-up-chat";
import {
  getCachedInsight,
  insightCacheKey,
  setCachedInsight,
} from "./insight-cache";
import { PipelineStepper, type PipelineStage } from "./pipeline-stepper";

export interface InsightRunnerProps {
  packType: InsightPackType;
  accountId: number | null;
  title: string;
  description: string;
  buildBody: () => InsightGenerateBody | null;
  runLabel?: string;
  /** When provided, the pipeline runs automatically whenever this key changes. */
  autoRunKey?: string | null;
  controls?: ReactNode;
  /** Full-width parameter panel rendered above the results (always visible). */
  panel?: ReactNode;
  /** One-line headline derived from the computed data (deterministic). */
  headline?: (data: InsightComputedPayload["data"], pack: EvidencePack) => string | null;
  renderStructured: (
    data: InsightComputedPayload["data"],
    pack: EvidencePack,
  ) => ReactNode;
}

export function InsightRunner({
  packType,
  accountId,
  title,
  description,
  buildBody,
  runLabel = "生成报告",
  autoRunKey = null,
  controls,
  panel,
  headline,
  renderStructured,
}: InsightRunnerProps) {
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [pack, setPack] = useState<EvidencePack | null>(null);
  const [data, setData] = useState<InsightComputedPayload["data"] | null>(null);
  const [aiText, setAiText] = useState("");
  const [packId, setPackId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const body = buildBody();
    if (!body || accountId == null) return;
    const cacheKey = insightCacheKey(packType, autoRunKeyRef.current);
    let latestPack: EvidencePack | null = null;
    let latestData: InsightComputedPayload["data"] | null = null;
    let latestText = "";
    setStage("fetching");
    setPack(null);
    setData(null);
    setAiText("");
    setPackId(null);
    setErrorMessage("");
    setFollowUpOpen(false);
    await streamInsightGenerate(packType, body, {
      onComputed: (payload) => {
        if (!mountedRef.current) return;
        latestPack = payload.pack;
        latestData = payload.data;
        setPack(payload.pack);
        setData(payload.data);
        setStage("interpreting");
      },
      onAiDelta: (text) => {
        if (!mountedRef.current) return;
        latestText += text;
        setAiText((current) => current + text);
      },
      onDone: (info) => {
        if (!mountedRef.current) return;
        setPackId(info.pack_id ?? null);
        setStage("done");
        if (latestPack && latestData) {
          setCachedInsight(cacheKey, {
            stage: "done",
            pack: latestPack,
            data: latestData,
            aiText: latestText,
            packId: info.pack_id ?? null,
          });
        }
      },
      onError: (message) => {
        if (!mountedRef.current) return;
        setErrorMessage(message);
        setStage("error");
        if (latestPack && latestData) {
          setCachedInsight(cacheKey, {
            stage: "done",
            pack: latestPack,
            data: latestData,
            aiText: latestText,
            packId: null,
          });
        }
      },
    });
  }, [accountId, buildBody, packType]);

  const autoRunRef = useRef(run);
  autoRunRef.current = run;
  const autoRunKeyRef = useRef(autoRunKey);
  autoRunKeyRef.current = autoRunKey;
  useEffect(() => {
    const hit = getCachedInsight(insightCacheKey(packType, autoRunKey));
    if (hit) {
      setStage(hit.stage);
      setPack(hit.pack);
      setData(hit.data);
      setAiText(hit.aiText);
      setPackId(hit.packId);
      setErrorMessage("");
      return;
    }
    if (autoRunKey != null) void autoRunRef.current();
  }, [autoRunKey, packType]);

  const index = useEvidenceIndex(pack);
  const running = stage === "fetching" || stage === "interpreting";
  const headlineText = pack && data && headline ? headline(data, pack) : null;

  return (
    <div className="flex h-full min-h-0 items-stretch gap-6">
      {/* main column */}
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-normal tracking-[-0.02em]">{title}</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {controls}
            {autoRunKey == null ? (
              <button
                type="button"
                onClick={() => void run()}
                disabled={running || accountId == null}
                className="bg-foreground text-background inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {running ? (
                  <RefreshCwIcon className="size-4 animate-spin" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
                {running ? "执行中" : runLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void run()}
                disabled={running || accountId == null}
                className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40"
              >
                <RefreshCwIcon className={cn("size-4", running && "animate-spin")} />
                重新生成
              </button>
            )}
          </div>
        </div>

        <PipelineStepper
          stage={stage}
          hasPack={pack != null}
          note={
            pack
              ? `证据包 ${pack.pack_id.slice(0, 8)} · 数据截至 ${pack.as_of}`
              : "先由确定性计算生成证据包，再由 AI 基于证据解读"
          }
        />

        {panel}

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#f3c5c5] bg-[#FFF7F7] px-6 py-4">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-[#b91c1c]" />
            <div>
              <p className="text-sm font-medium text-[#b91c1c]">
                {pack ? "AI 解读失败" : "流水线执行失败"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8a4444]">{errorMessage}</p>
            </div>
          </div>
        ) : null}

        {headlineText ? (
          <div className="border-border bg-card rounded-2xl border px-6 py-5">
            <p className="text-foreground font-serif text-xl leading-8 tracking-[-0.01em]">
              {headlineText}
            </p>
          </div>
        ) : null}

        {pack && data ? renderStructured(data, pack) : null}

        {aiText || stage === "interpreting" || (stage === "done" && pack) ? (
          <section>
            <div className="border-border flex items-baseline justify-between border-t pt-3">
              <span className="text-muted-foreground text-[10px] font-bold tracking-[0.18em] uppercase">
                AI 解读
              </span>
              <span className="text-muted-foreground text-[11px]">
                仅基于证据包 · 引用编号可点击核对
              </span>
            </div>
            <div className="border-[#c9a86a] mt-4 border-l-2 pl-5 text-sm">
              {aiText ? (
                <AiMarkdown text={aiText} index={index} />
              ) : stage === "interpreting" ? (
                <div className="space-y-2">
                  <div className="bg-muted h-3.5 w-11/12 animate-pulse rounded" />
                  <div className="bg-muted h-3.5 w-2/3 animate-pulse rounded" />
                </div>
              ) : (
                <p className="text-muted-foreground">本次未生成解读文本。</p>
              )}
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              AI 解读仅供参考，所有数字以结构化数据与右侧证据为准。
            </p>
          </section>
        ) : null}

        {stage === "done" && followUpOpen ? (
          <FollowUpChat packId={packId} index={index} />
        ) : null}
      </div>

      {/* evidence rail */}
      <aside className="border-border bg-card hidden w-[300px] shrink-0 overflow-hidden rounded-2xl border xl:block">
        <EvidenceRail
          pack={pack}
          onFollowUp={
            stage === "done" && packId
              ? () => setFollowUpOpen((open) => !open)
              : undefined
          }
        />
      </aside>
    </div>
  );
}
