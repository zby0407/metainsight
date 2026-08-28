import { ExternalLinkIcon, FileTextIcon, NewspaperIcon } from "lucide-react";

import type { NewsFollowUpContext } from "@/core/finance/news";
import { cn } from "@/lib/utils";

export function NewsChatContextCard({
  className,
  context,
}: {
  className?: string;
  context: NewsFollowUpContext;
}) {
  const article = context.kind === "article";
  const Icon = article ? FileTextIcon : NewspaperIcon;

  return (
    <div
      aria-label={article ? "引用的新闻报道" : "引用的新闻事件"}
      className={cn(
        "border-border/70 bg-card/75 overflow-hidden rounded-2xl border text-left shadow-[0_12px_36px_-28px_rgba(0,0,0,0.65)] backdrop-blur",
        className,
      )}
    >
      <div className="flex min-w-0 gap-3.5 p-4 sm:p-5">
        <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="text-foreground font-medium">
              {article ? "单篇报道" : "新闻聚合"}
            </span>
            {context.sourceName && (
              <>
                <span>·</span>
                <span>{context.sourceName}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 line-clamp-2 text-[15px] leading-6 font-semibold">
            {context.title}
          </div>
          {article && context.eventTitle !== context.title && (
            <div className="text-muted-foreground mt-1 truncate text-xs">
              来自聚合：{context.eventTitle}
            </div>
          )}
          {context.summary && (
            <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-5">
              {context.summary}
            </p>
          )}
        </div>
      </div>
      {context.sourceUrl && (
        <a
          className="text-muted-foreground bg-muted/10 hover:bg-muted/60 hover:text-foreground flex items-center justify-between border-t px-4 py-2.5 text-xs transition-colors sm:px-5"
          href={context.sourceUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{article ? "查看这篇原文" : "查看代表来源"}</span>
          <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}
