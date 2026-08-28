import {
  CircleHelpIcon,
  ListTreeIcon,
  NewspaperIcon,
  ScaleIcon,
  SearchCheckIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

import type { NewsFollowUpContext } from "@/core/finance/news";

export function NewsChatWelcomeHeader({
  context,
}: {
  context: NewsFollowUpContext;
}) {
  const article = context.kind === "article";

  return (
    <div className="mb-5 text-center">
      <div className="border-primary/15 bg-primary/8 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
        <NewspaperIcon className="size-3.5" />
        新闻追问
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">
        围绕这条新闻继续追问
      </h1>
      <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm leading-6">
        {article
          ? "已带入这篇报道及其所属新闻事件，你可以直接询问依据、观点和可信度。"
          : "已带入事件摘要和代表来源，你可以直接询问脉络、影响和不同来源的观点。"}
      </p>
    </div>
  );
}

interface NewsPromptSuggestion {
  icon: LucideIcon;
  label: string;
  prompt: string;
}

function suggestionsForContext(
  context: NewsFollowUpContext,
): NewsPromptSuggestion[] {
  if (context.kind === "article") {
    return [
      {
        icon: SearchCheckIcon,
        label: "提炼核心观点",
        prompt: "这篇报道的核心观点和关键依据是什么？",
      },
      {
        icon: ScaleIcon,
        label: "评估报道可信度",
        prompt: "这篇报道的可信度如何？哪些内容已经得到其他来源印证？",
      },
      {
        icon: TrendingUpIcon,
        label: "分析潜在影响",
        prompt: "这篇报道可能带来哪些后续影响？",
      },
      {
        icon: CircleHelpIcon,
        label: "找出待核实信息",
        prompt: "这篇报道中还有哪些信息需要进一步核实？",
      },
    ];
  }

  return [
    {
      icon: ListTreeIcon,
      label: "梳理事件脉络",
      prompt: "请梳理这件事的背景、关键节点和最新进展。",
    },
    {
      icon: ScaleIcon,
      label: "比较来源差异",
      prompt: "不同来源对这件事的报道重点和观点有哪些差异？",
    },
    {
      icon: TrendingUpIcon,
      label: "分析潜在影响",
      prompt: "这件事可能对相关行业和普通人带来哪些影响？",
    },
    {
      icon: CircleHelpIcon,
      label: "找出待核实信息",
      prompt: "关于这件事，还有哪些信息尚未得到充分核实？",
    },
  ];
}

export function NewsChatPromptSuggestions({
  context,
  onSelect,
}: {
  context: NewsFollowUpContext;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div aria-label="新闻追问建议" className="mt-4">
      <div className="text-muted-foreground mb-2 px-1 text-xs font-medium">
        可以这样问
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {suggestionsForContext(context).map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <button
              className="border-border/70 bg-background/55 hover:border-primary/25 hover:bg-accent/70 hover:text-accent-foreground flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors"
              key={suggestion.label}
              onClick={() => onSelect(suggestion.prompt)}
              type="button"
            >
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <span>{suggestion.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
