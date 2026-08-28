"use client";

import { CopyIcon, MessageSquareIcon } from "lucide-react";
import { useState } from "react";

const AI_LINKS = [
  { name: "问 ChatGPT", href: "https://chatgpt.com/?q=了解一下 MetaInsight 智能投研工作台" },
  { name: "问 Claude", href: "https://claude.ai/new?q=了解一下 MetaInsight 智能投研工作台" },
  { name: "问 Gemini", href: "https://gemini.google.com/app?q=了解一下 MetaInsight 智能投研工作台" },
  { name: "问 Perplexity", href: "https://www.perplexity.ai/search?q=了解一下 MetaInsight 智能投研工作台" },
  { name: "问 Grok", href: "https://grok.com/?q=了解一下 MetaInsight 智能投研工作台" },
] as const;

const PROMPT =
  "请介绍一下 MetaInsight 智能投研工作台：它如何把行情、资讯与多模型分析整合成一条可回溯的投研链路，相比传统行情软件有什么优势？";

export function AskAi() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="bg-foreground text-background flex w-full flex-col border-b border-neutral-800 lg:flex-row">
      <div className="flex w-full flex-col justify-center p-12 lg:w-1/2 lg:p-16 xl:p-24">
        <div className="mb-6 inline-flex items-center gap-2">
          <span className="text-background/50 text-[10px] font-bold tracking-widest uppercase">
            问问 AI
          </span>
        </div>
        <h2 className="mb-6 font-serif text-4xl font-medium tracking-[-0.02em] md:text-5xl">
          还有疑问？
        </h2>
        <p className="text-background/70 max-w-md text-lg leading-relaxed font-light md:text-xl">
          不必只听我们说。看看你常用的 AI 如何评价 MetaInsight。
        </p>
      </div>

      <div className="grid w-full grid-cols-2 gap-[1px] border-t border-neutral-800 bg-neutral-800 sm:grid-cols-3 lg:w-1/2 lg:border-t-0 lg:border-l">
        {AI_LINKS.map((link) => (
          <a
            key={link.name}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground hover:bg-foreground/80 group col-span-1 flex flex-col items-center justify-center gap-2 px-2 py-8 transition-colors"
          >
            <MessageSquareIcon className="text-background/70 h-10 w-10 shrink-0 transition-all duration-300 group-hover:scale-105 group-hover:text-background" />
            <span className="text-background font-sans text-xs font-medium transition-transform duration-300 group-hover:scale-105 sm:text-sm">
              {link.name}
            </span>
          </a>
        ))}
        <button
          onClick={copy}
          className="bg-foreground hover:bg-foreground/80 group col-span-1 flex flex-col items-center justify-center gap-2 px-2 py-8 text-center transition-colors"
        >
          <CopyIcon className="text-background/70 h-10 w-10 shrink-0 transition-transform duration-300 group-hover:scale-105" />
          <span className="text-background font-sans text-xs font-medium transition-transform duration-300 group-hover:scale-105 sm:text-sm">
            {copied ? "已复制" : "复制提示词"}
          </span>
        </button>
        <a
          href="/workspace"
          className="bg-foreground hover:bg-foreground/80 group col-span-2 flex items-center justify-center p-4 transition-colors sm:col-span-3 lg:p-6"
        >
          <span className="text-background font-sans text-xs font-medium transition-transform duration-300 group-hover:scale-105 sm:text-sm">
            直接进入工作台
          </span>
        </a>
      </div>
    </section>
  );
}
