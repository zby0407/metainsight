import { CheckIcon, XIcon } from "lucide-react";

import { Reveal } from "./reveal";

const STEPS = [
  {
    painting: "/images/landing/painting1.jpg",
    title: "接入与筛选",
    body: "汇总多市场行情与资讯，按自选、板块与主题过滤出真正需要关注的标的。",
    visual: "website" as const,
  },
  {
    painting: "/images/landing/painting2.jpg",
    title: "分析与验证",
    body: "在对话中调用数据与模型完成推演，每条结论都标注引用来源，便于逐条核对。",
    visual: "match" as const,
  },
  {
    painting: "/images/landing/painting3.jpg",
    title: "沉淀与复用",
    body: "把研判结果归档为可检索的研究记录，下一次决策直接从既有结论继续推进。",
    visual: "message" as const,
  },
];

function WebsiteVisual() {
  return (
    <div className="text-foreground/70 flex items-center gap-3 rounded-full border border-black/10 bg-white px-5 py-3 text-sm shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
      <span className="text-foreground/40">🌐</span>
      <span className="text-foreground/90 font-mono font-medium">
        metainsight.ai
      </span>
    </div>
  );
}

function MatchVisual() {
  return (
    <div className="relative flex w-full max-w-[260px] flex-col gap-2.5 px-4">
      <div className="flex items-center justify-between rounded-[14px] border border-black/[0.08] bg-white px-4 py-3 shadow-[0_4px_12px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13.5px] leading-none font-medium tracking-tight text-[#2D2D2D]">
            贵州茅台
          </span>
          <span className="text-[10px] font-medium tracking-tight text-[#808080]">
            强势突破
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#F1F9EE] px-2.5 py-1 text-[#478433]">
          <span className="text-[11px] font-medium tracking-tight">
            98% 匹配
          </span>
          <CheckIcon width={10} height={10} strokeWidth={2.5} />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-[14px] border border-black/[0.08] bg-white px-4 py-3 shadow-[0_4px_12px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13.5px] leading-none font-medium tracking-tight text-[#2D2D2D]">
            某弱势股
          </span>
          <span className="text-[10px] font-medium tracking-tight text-[#808080]">
            量能不足
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#FFF2F2] px-2.5 py-1 text-[#DD7B7B]">
          <span className="text-[11px] font-medium tracking-tight">
            30% 匹配
          </span>
          <XIcon width={10} height={10} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function MessageVisual() {
  return (
    <div className="flex w-[90%] max-w-[240px] translate-y-6 flex-col rounded-xl border border-black/10 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] md:w-[240px]">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2.5">
        <span className="text-foreground text-[12px] font-bold">研究结论</span>
        <div className="text-foreground/50 flex gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/5">
            <CheckIcon width={10} height={10} strokeWidth={2.5} />
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2.5 border-b border-black/5 px-3 py-2.5">
        <div className="text-foreground/70 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/5 bg-black/10 text-xs font-bold shadow-sm">
          茅
        </div>
        <div className="flex flex-col">
          <span className="text-foreground mb-0.5 text-[12px] leading-tight font-bold">
            贵州茅台{" "}
            <span className="text-foreground/60 text-[11px] font-normal">
              600519
            </span>
          </span>
          <span className="text-foreground/80 text-[10px] leading-snug">
            基本面稳健 · 估值合理
          </span>
        </div>
      </div>
      <div className="relative px-3 py-2.5">
        <div className="text-foreground/60 h-[65px] rounded-md border border-black/5 bg-[#f4f2ee] p-2.5 text-[11px] shadow-inner">
          已归档至研究记录，可随时复盘引用…
        </div>
      </div>
      <div className="flex items-center justify-between rounded-b-xl border-t border-black/5 bg-white px-3 py-2">
        <span className="text-foreground/50 text-[10px]">
          引用来源 · 3 条
        </span>
        <button className="cursor-not-allowed rounded-full bg-black/10 px-3.5 py-1.5 text-[11px] font-bold text-black/40">
          已留存
        </button>
      </div>
    </div>
  );
}

const VISUALS = {
  website: WebsiteVisual,
  match: MatchVisual,
  message: MessageVisual,
};

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-border bg-background flex w-full flex-col items-center border-b px-6 py-16 md:px-12 md:py-24"
    >
      <div className="w-full max-w-[1200px]">
        <Reveal className="mb-16 text-center">
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="text-eyebrow text-foreground/50">产品原理</span>
          </div>
          <h2 className="text-foreground mx-auto max-w-2xl font-serif font-normal text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
            三步完成一次完整研究。
          </h2>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => {
            const Visual = VISUALS[step.visual];
            return (
              <Reveal
                key={step.title}
                delay={i * 120}
                className="group flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
              >
                <div className="relative flex h-[250px] items-center justify-center overflow-hidden border-b border-black/[0.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={step.painting}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#fafafa] to-transparent" />
                  <div className="relative z-10 transition-transform duration-500 group-hover:scale-105">
                    <Visual />
                  </div>
                </div>
                <div className="flex-1 bg-white px-8 pt-4 pb-8 text-center md:px-10 md:pb-10">
                  <h3 className="text-foreground mb-3 text-[17px] font-bold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-foreground/60 text-[13px] leading-relaxed font-medium">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
