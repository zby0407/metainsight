import {
  ArrowUpIcon,
  BookOpenIcon,
  CodeIcon,
  CoffeeIcon,
  PenLineIcon,
  Plug2Icon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";

const PROMPT_CHIPS = [
  { icon: SparklesIcon, label: "创建" },
  { icon: CodeIcon, label: "代码" },
  { icon: BookOpenIcon, label: "学习" },
  { icon: PenLineIcon, label: "写作" },
  { icon: CoffeeIcon, label: "生活" },
] as const;

export function AiNative() {
  return (
    <section className="flex w-full flex-col items-center border-t border-white/5 bg-neutral-950 px-6 py-16 text-white md:px-12 md:py-24">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2">
          <span className="text-eyebrow text-white/40">AI 原生</span>
        </div>
        <h2 className="mx-auto mb-6 max-w-3xl font-serif font-normal text-3xl leading-tight tracking-[-0.02em] text-white md:text-5xl">
          为人类与智能体而生。
        </h2>
        <p className="mx-auto mb-8 max-w-3xl text-sm leading-relaxed text-white/70 md:text-lg">
          你可以把 MetaInsight 接入 Claude、ChatGPT 或任意 AI 智能体。用自然语言触达
          行情查询、研报生成与组合跟踪，无需复杂的 API 集成。
        </p>
        <Link
          href="/workspace"
          className="text-foreground mb-16 inline-flex items-center justify-center rounded-sm bg-neutral-100 px-8 py-3.5 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:bg-neutral-200 md:text-base"
        >
          免费进入工作台
        </Link>

        <div className="text-foreground flex w-full flex-col items-center rounded-[24px] border border-black/[0.08] bg-[#f9f9f9] p-6 shadow-2xl md:rounded-[32px] md:p-12">
          <div className="mb-10 flex items-center gap-2 rounded-full bg-black/5 px-4 py-1.5 md:mb-16">
            <span className="text-foreground/70 flex items-center gap-2 text-[12px] font-medium">
              <Plug2Icon className="h-4 w-4 rotate-45" />
              MetaInsight MCP
            </span>
          </div>

          <div className="mb-8 flex items-center gap-3 md:mb-12">
            <div className="text-[#da7756]">
              <SparklesIcon width={40} height={40} fill="currentColor" />
            </div>
            <h3 className="text-3xl font-medium tracking-tight text-[#2d2d2d] md:text-4xl">
              下午好
            </h3>
          </div>

          <div className="mb-6 flex w-full max-w-3xl flex-col rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm">
            <div className="text-foreground/80 flex min-h-[60px] w-full justify-start p-2 text-left text-[15px] font-medium md:text-[17px]">
              <span className="block w-full text-left">
                帮我分析贵州茅台最新的资金动向
                <span className="animate-pulse">|</span>
              </span>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-2">
                <button className="text-foreground/50 flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 transition-colors hover:bg-black/5">
                  <PlusIcon width={16} height={16} />
                </button>
                <button className="text-foreground/50 flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 transition-colors hover:bg-black/5">
                  <SlidersHorizontalIcon width={14} height={14} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-foreground/50 hidden cursor-pointer items-center gap-1 text-[13px] font-medium hover:text-foreground/70 md:flex">
                  Claude Opus 5
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#da7756] text-white shadow-sm transition-opacity hover:opacity-90">
                  <ArrowUpIcon width={16} height={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                className="text-foreground/70 flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[13px] font-medium shadow-sm transition-colors hover:bg-black/5"
              >
                <chip.icon width={14} height={14} strokeWidth={2.5} />
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
