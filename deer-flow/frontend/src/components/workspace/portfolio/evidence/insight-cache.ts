import type { EvidencePack } from "@/core/portfolio/evidence-pack";
import type { InsightComputedPayload } from "@/core/portfolio/insights-api";

import type { PipelineStage } from "./pipeline-stepper";

export interface CachedInsight {
  stage: PipelineStage;
  pack: EvidencePack;
  data: InsightComputedPayload["data"];
  aiText: string;
  packId: string | null;
}

/** Module-level cache so switching between insight tabs restores the last
 * report instantly instead of re-running the whole pipeline. */
const cache = new Map<string, CachedInsight>();

export function insightCacheKey(packType: string, autoRunKey: string | null) {
  return `${packType}|${autoRunKey ?? "manual"}`;
}

export function getCachedInsight(key: string) {
  return cache.get(key);
}

export function setCachedInsight(key: string, value: CachedInsight) {
  cache.set(key, value);
}
