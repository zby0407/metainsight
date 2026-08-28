"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "MetaInsight 和普通行情软件有什么区别？",
    a: "普通行情软件为展示数据而生，MetaInsight 为研究决策而生。我们把行情、资讯与多模型分析串成一条链路，每条结论都可回溯到原始数据。",
  },
  {
    q: "你们如何确定我的研究范围？",
    a: "你可以用自然语言描述关注方向，或导入自选清单，系统会自动界定研究范围并持续跟踪相关标的。",
  },
  {
    q: "免费试用期结束后会怎样？",
    a: "试用结束后可自由选择是否升级。未升级也不会丢失已沉淀的研究记录，仍可随时查看。",
  },
  {
    q: "数据来源于哪些市场？",
    a: "目前覆盖 A股、港股、美股三地市场，行情与资讯分钟级更新。",
  },
  {
    q: "MetaInsight 支持 MCP 吗？",
    a: "支持。你可以把 MetaInsight 通过 MCP 接入 Claude、ChatGPT 等 AI 智能体，用自然语言触达各项能力。",
  },
  {
    q: "我的研究数据会被保密吗？",
    a: "会。你的自选、组合与研究记录仅对你的账号可见，我们不会用于任何其他用途。",
  },
  {
    q: "可以随时取消订阅吗？",
    a: "可以。随时一键取消，不设任何门槛，已付费周期内功能不受影响。",
  },
] as const;

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="border-border bg-background flex w-full flex-col items-center border-b px-8 py-24 md:px-12 md:py-32"
    >
      <div className="w-full max-w-3xl">
        <Reveal className="mb-16">
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="text-eyebrow text-foreground/50">常见问题</span>
          </div>
          <h2 className="text-foreground font-serif font-normal text-3xl leading-tight tracking-[-0.02em] md:text-4xl">
            常见问题
          </h2>
        </Reveal>

        <div className="border-border flex flex-col border-t">
          {FAQS.map((faq, i) => {
            const open = openIndex === i;
            return (
              <Reveal key={faq.q} delay={i * 40} className="border-border border-b">
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="group flex w-full items-center justify-between py-6 text-left focus:outline-none"
                >
                  <span className="text-foreground group-hover:text-foreground/80 pr-8 font-medium transition-colors">
                    {faq.q}
                  </span>
                  <div
                    className={cn(
                      "shrink-0 transition-transform duration-300",
                      open && "rotate-180",
                    )}
                  >
                    <ChevronDownIcon
                      width={18}
                      height={18}
                      className="text-foreground/40 group-hover:text-foreground/60 transition-colors"
                    />
                  </div>
                </button>
                <div
                  className={cn(
                    "grid overflow-hidden transition-all duration-300",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-foreground/60 pb-8 leading-relaxed font-light">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
