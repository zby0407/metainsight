"use client";

import { createContext, useContext, useMemo } from "react";

import {
  buildEvidenceIndex,
  evidenceEntrySummary,
  type EvidenceEntry,
  type EvidencePack,
} from "@/core/portfolio/evidence-pack";
import { cn } from "@/lib/utils";

export const EvidenceIndexContext = createContext<Map<string, EvidenceEntry>>(
  new Map(),
);

export function useEvidenceIndex(pack: EvidencePack | null) {
  return useMemo(
    () => (pack ? buildEvidenceIndex(pack) : new Map<string, EvidenceEntry>()),
    [pack],
  );
}

function badgeTone(id: string, known: boolean) {
  if (!known) return "border-[#f3c5c5] bg-[#FFF2F2] text-[#b91c1c]";
  const prefix = id.split("-")[0];
  if (prefix === "G") return "border-[#eadfc3] bg-[#FDF6E7] text-[#8a5a00]";
  if (prefix === "R") return "border-[#d8dde5] bg-[#EFF2F7] text-[#3d4f73]";
  return "border-border bg-transparent text-foreground/60";
}

/** Inline evidence citation chip. Reads the surrounding evidence index from
 * context so it can be embedded inside rendered markdown. */
export function EvidenceBadge({ id }: { id: string }) {
  const index = useContext(EvidenceIndexContext);
  const entry = index.get(id);
  const summary = entry
    ? evidenceEntrySummary(entry)
    : "证据包中未找到该编号";
  return (
    <button
      type="button"
      data-evidence-id={id}
      title={summary}
      onClick={() => {
        const target = document.getElementById(`evidence-${id}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("ring-2", "ring-[#c9a86a]");
          window.setTimeout(
            () => target.classList.remove("ring-2", "ring-[#c9a86a]"),
            1600,
          );
        }
      }}
      className={cn(
        "mx-0.5 inline-flex translate-y-[-1px] cursor-pointer items-center rounded border px-1 text-[11px] font-medium tabular-nums leading-4 transition-colors",
        badgeTone(id, Boolean(entry)),
      )}
    >
      {id}
    </button>
  );
}
