"use client";

import type { AnchorHTMLAttributes } from "react";
import { useMemo } from "react";

import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import type { EvidenceEntry } from "@/core/portfolio/evidence-pack";
import { streamdownPlugins } from "@/core/streamdown";

import { EvidenceBadge, EvidenceIndexContext } from "./citation-text";

const EVIDENCE_HREF = /^evidence:([A-Z]+-\d+)$/;

function EvidenceMarkdownLink({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const match = typeof href === "string" ? EVIDENCE_HREF.exec(href) : null;
  if (match) {
    return <EvidenceBadge id={match[1] ?? ""} />;
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

/** Renders AI interpretation text as markdown with evidence citations.
 * `[F-3]`-style ids are rewritten to `evidence:` links so the shared markdown
 * renderer can embed clickable citation badges without raw HTML. */
export function AiMarkdown({
  text,
  index,
}: {
  text: string;
  index: Map<string, EvidenceEntry>;
}) {
  const linked = useMemo(
    () => text.replace(/\[([A-Z]+-\d+)\]/g, "[$1](evidence:$1)"),
    [text],
  );
  return (
    <EvidenceIndexContext.Provider value={index}>
      <MarkdownContent
        content={linked}
        isLoading={false}
        rehypePlugins={streamdownPlugins.rehypePlugins}
        components={{ a: EvidenceMarkdownLink }}
      />
    </EvidenceIndexContext.Provider>
  );
}
