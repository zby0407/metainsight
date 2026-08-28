"use client";

import {
  Children,
  isValidElement,
  useMemo,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import {
  isSourcesHeadingText,
  preprocessStreamdownMarkdown,
  streamdownPlugins,
} from "@/core/streamdown";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";

function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

function textFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return Children.toArray(node).map(textFromReactNode).join("");
}

function SourceAwareHeading({
  as: Heading,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as: "h2" | "h3" | "h4";
}) {
  const isSourcesHeading = isSourcesHeadingText(textFromReactNode(children));
  return (
    <Heading
      {...props}
      className={cn(className, isSourcesHeading && "markdown-sources-heading")}
      data-source-heading={isSourcesHeading ? "true" : undefined}
    >
      {children}
    </Heading>
  );
}

export function MarkdownLink({
  className,
  target,
  rel,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (typeof children === "string") {
    const match = /^citation:(.+)$/.exec(children);
    if (match) {
      const [, text] = match;
      return (
        <CitationLink {...props} className={className}>
          {text}
        </CitationLink>
      );
    }
  }

  const external = isExternalUrl(props.href);
  return (
    <a
      {...props}
      className={cn("markdown-link", className)}
      data-markdown-external={external ? "true" : undefined}
      target={target ?? (external ? "_blank" : undefined)}
      rel={rel ?? (external ? "noopener noreferrer" : undefined)}
    >
      {children}
    </a>
  );
}

export type MarkdownContentProps = {
  content: string;
  isLoading: boolean;
  rehypePlugins: MessageResponseProps["rehypePlugins"];
  className?: string;
  remarkPlugins?: MessageResponseProps["remarkPlugins"];
  components?: MessageResponseProps["components"];
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
    return {
      a: MarkdownLink,
      h2: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <SourceAwareHeading as="h2" {...props} />
      ),
      h3: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <SourceAwareHeading as="h3" {...props} />
      ),
      h4: (props: HTMLAttributes<HTMLHeadingElement>) => (
        <SourceAwareHeading as="h4" {...props} />
      ),
      ...componentsFromProps,
    };
  }, [componentsFromProps]);

  if (!content) return null;

  return (
    <MessageResponse
      className={cn("assistant-markdown", className)}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {normalizedContent}
    </MessageResponse>
  );
}
