"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";
import type { AnchorHTMLAttributes, ComponentType } from "react";

import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import {
  preprocessStreamdownMarkdown,
  streamdownPlugins,
} from "@/core/streamdown";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";

function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

export type MarkdownContentProps = {
  content: string;
  isLoading: boolean;
  rehypePlugins: MessageResponseProps["rehypePlugins"];
  className?: string;
  remarkPlugins?: MessageResponseProps["remarkPlugins"];
  components?: MessageResponseProps["components"];
};

type SourceAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  "data-zhiheng-source-link": string;
};

/** Renders markdown content. */
export function MarkdownContent({
  content,
  rehypePlugins,
  className,
  remarkPlugins = streamdownPlugins.remarkPlugins,
  components: componentsFromProps,
}: MarkdownContentProps) {
  const normalizedContent = useMemo(
    () => preprocessStreamdownMarkdown(content),
    [content],
  );
  const components = useMemo(() => {
    const { a: anchorFromProps, ...otherComponents } =
      componentsFromProps ?? {};
    const AnchorFromProps = anchorFromProps as
      | ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>>
      | undefined;
    return {
      ...otherComponents,
      a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (typeof props.children === "string") {
          const match = /^citation:(.+)$/.exec(props.children);
          if (match) {
            const [, text] = match;
            return <CitationLink {...props}>{text}</CitationLink>;
          }
        }
        const { className, target, rel, children, ...rest } = props;
        const external = isExternalUrl(props.href);
        const sourceLink = (
          <>
            {children}
            {external && (
              <ExternalLinkIcon
                aria-hidden="true"
                className="mb-0.5 ml-1 inline size-3 align-middle"
              />
            )}
          </>
        );
        const anchorProps: SourceAnchorProps = {
          ...rest,
          "data-zhiheng-source-link": "true",
          className: cn(
            "rounded-sm font-semibold text-blue-700 underline decoration-blue-500/70 decoration-2 underline-offset-4 transition-colors hover:bg-blue-500/10 hover:text-blue-800 hover:decoration-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-blue-300 dark:hover:text-blue-200",
            className,
          ),
          target: target ?? (external ? "_blank" : undefined),
          rel: rel ?? (external ? "noopener noreferrer" : undefined),
        };
        return AnchorFromProps ? (
          <AnchorFromProps {...anchorProps}>{sourceLink}</AnchorFromProps>
        ) : (
          <a {...anchorProps}>{sourceLink}</a>
        );
      },
    };
  }, [componentsFromProps]);

  if (!content) return null;

  return (
    <MessageResponse
      className={className}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {normalizedContent}
    </MessageResponse>
  );
}
