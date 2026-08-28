"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

type Plan = {
  name: string;
  blurb: string;
  monthly: number;
  yearly: number;
  yearlyTotal: number;
  cta: string;
  recommended?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "入门版",
    blurb: "适合刚开始接触智能投研的个人投资者。",
    monthly: 20,
    yearly: 17,
    yearlyTotal: 200,
    cta: "立即开始研究",
    features: ["100 次行情查询 / 月", "MCP 接入", "1 个自选组合", "1 个席位"],
  },
  {
    name: "进阶版",
    blurb: "为进阶投资者提供更深的洞察与信号。",
    monthly: 39,
    yearly: 33,
    yearlyTotal: 390,
    cta: "立即开始研究",
    recommended: true,
    features: ["200 次行情查询 / 月", "MCP 接入", "3 个自选组合", "2 个席位"],
  },
  {
    name: "旗舰版",
    blurb: "完整 API 与系统集成，支撑规模化研究。",
    monthly: 99,
    yearly: 83,
    yearlyTotal: 990,
    cta: "立即开始研究",
    features: [
      "1000 次行情查询 / 月",
      "MCP 接入",
      "5 个自选组合",
      "5 个席位",
      "API / Webhook 接入",
      "CRM / 研报系统集成",
    ],
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <section
      id="pricing"
      className="bg-background text-foreground flex w-full flex-col items-center pt-32 pb-0"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 md:px-12">
        <div className="mb-16 text-center">
          <h2 className="mb-6 font-serif text-4xl font-medium tracking-[-0.02em] md:text-5xl">
            简单透明的方案
          </h2>
          <p className="text-muted-foreground mx-auto max-w-xl text-lg font-light">
            选择适合你目标的方案，随时切换或取消。
          </p>
        </div>

        <div className="mb-8 flex items-center justify-center">
          <div className="border-border bg-background relative z-10 inline-flex items-center rounded-full border p-1">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300",
                !yearly
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground bg-transparent",
              )}
            >
              按月
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                "flex items-center gap-2 rounded-full px-6 py-2.5 text-sm transition-all duration-300",
                yearly
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground font-medium bg-transparent",
              )}
            >
              按年
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase transition-colors",
                  yearly
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                省 2 个月
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="relative w-full">
        <div className="relative z-10 w-full">
          <div className="bg-border border-border grid w-full grid-cols-1 gap-[1px] border-y md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "bg-background relative flex flex-col border border-t-8 px-10 py-10 md:px-12 lg:px-16 lg:py-16",
                  plan.recommended
                    ? "border-lime-500/90"
                    : "border-background",
                )}
              >
                {plan.recommended ? (
                  <div className="absolute top-10 right-8 flex items-center justify-center lg:top-12 lg:right-10">
                    <span className="border-foreground/20 rounded-full border px-3 py-1 text-[10px] font-medium tracking-wide uppercase">
                      推荐
                    </span>
                  </div>
                ) : null}

                <div className="mb-8">
                  <h3 className="mb-2 font-serif text-4xl font-medium">
                    {plan.name}
                  </h3>
                  <p className="text-muted-foreground h-10 text-sm font-light">
                    {plan.blurb}
                  </p>
                </div>

                <div className="mb-8">
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-4xl font-medium tracking-tight lg:text-5xl">
                      ¥{yearly ? plan.yearly : plan.monthly}
                    </span>
                    <span className="text-muted-foreground text-sm font-light">
                      /月
                    </span>
                  </div>
                  <div className="mt-1 h-6">
                    {yearly ? (
                      <span className="text-muted-foreground text-xs font-light">
                        按年计费 · ¥{plan.yearlyTotal}/年
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mb-10">
                  <Link
                    href="/workspace"
                    className={cn(
                      "group inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-4 font-medium transition-all hover:-translate-y-0.5",
                      plan.recommended
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-background text-foreground border border-neutral-300",
                    )}
                  >
                    {plan.cta}
                  </Link>
                </div>

                <div className="flex flex-1 flex-col">
                  <div className="space-y-4">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="border-border flex items-start gap-3 border-b border-dashed pb-4 last:border-0 last:pb-0"
                      >
                        <CheckIcon width={16} height={16} className="shrink-0" />
                        <span className="text-foreground/80 text-sm leading-snug font-light">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
