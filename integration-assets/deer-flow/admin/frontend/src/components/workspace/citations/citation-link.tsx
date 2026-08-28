import { ExternalLinkIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export function CitationLink({
  href,
  children,
  className,
  ...props
}: ComponentProps<"a">) {
  const domain = extractDomain(href ?? "");

  const childrenText =
    typeof children === "string"
      ? children.replace(/^citation:\s*/i, "")
      : null;
  const isGenericText = childrenText === "Source" || childrenText === "来源";
  const displayText = (!isGenericText && childrenText) ?? domain;

  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-zhiheng-citation-link="true"
          className={cn(
            "mx-0.5 inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
            className,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-500/70 hover:bg-blue-500/20 dark:text-blue-300"
          >
            {displayText}
            <ExternalLinkIcon className="size-3" />
          </Badge>
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="relative w-80 p-0">
        <div className="p-3">
          <div className="space-y-1">
            {displayText && (
              <h4 className="truncate text-sm leading-tight font-medium">
                {displayText}
              </h4>
            )}
            {href && (
              <p className="text-muted-foreground truncate text-xs break-all">
                {href}
              </p>
            )}
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-700 underline decoration-blue-500/70 underline-offset-4 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
          >
            打开来源
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
