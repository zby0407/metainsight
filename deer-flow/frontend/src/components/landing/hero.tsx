import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { MarketPulseCard } from "@/components/landing/market-pulse-card";
import { cn } from "@/lib/utils";

const TRUST_POINTS = ["实时行情接入", "多模型协同分析", "研究全程可回溯"];

export function Hero({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "border-line bg-cream relative w-full overflow-hidden border-b",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,rgba(22,20,18,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(22,20,18,0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_50%_0%,black_15%,transparent_72%)]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pt-32 pb-20 md:pt-40 md:pb-28 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
        <div>
          <p className="text-ink/50 animate-mi-rise text-[11px] font-semibold tracking-[0.22em] uppercase opacity-0 [animation-delay:0.02s]">
            MetaInsight 智能投研工作台
          </p>

          <h1 className="text-ink animate-mi-rise mt-5 font-[family-name:var(--font-mi-serif)] text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.02] font-normal tracking-[-0.02em] opacity-0 [animation-delay:0.1s]">
            从市场数据，
            <br />
            到投资判断
          </h1>

          <p className="text-ink/70 animate-mi-rise mt-6 max-w-xl text-lg leading-8 opacity-0 [animation-delay:0.24s]">
            从政策信号到行情异动，让每一次结论成为下一次决策的起点。
          </p>

          <div className="animate-mi-rise mt-9 flex flex-wrap items-center gap-3 opacity-0 [animation-delay:0.34s]">
            <Link
              href="/workspace"
              className="bg-ink text-cream hover:bg-ink-soft group inline-flex h-12 items-center gap-2 rounded-lg px-7 text-[15px] font-medium shadow-[0_1px_2px_rgba(22,20,18,0.1)] transition-all duration-300 hover:-translate-y-0.5"
            >
              进入工作台
              <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/workspace/market"
              className="border-line text-ink hover:bg-cream-dark inline-flex h-12 items-center rounded-lg border bg-paper px-7 text-[15px] font-medium transition-colors"
            >
              查看市场
            </Link>
          </div>

          <ul className="text-ink/60 animate-mi-rise mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm opacity-0 [animation-delay:0.44s]">
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="bg-success size-1.5 rounded-full" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-mi-rise relative opacity-0 [animation-delay:0.3s]">
          <MarketPulseCard />
        </div>
      </div>
    </section>
  );
}
