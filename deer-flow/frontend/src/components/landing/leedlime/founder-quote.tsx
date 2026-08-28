import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Reveal } from "./reveal";

export function FounderQuote() {
  return (
    <section className="border-border bg-background flex w-full flex-col items-center border-b px-6 pt-16 pb-16 text-center md:px-12 md:pt-32 md:pb-24">
      <div className="w-full max-w-[1000px]">
        <Reveal>
          <p className="text-foreground mb-12 font-serif font-normal text-2xl leading-tight tracking-[-0.02em] md:text-4xl md:leading-12 lg:text-5xl">
            “过去做投研，要么昂贵、要么过时、要么信息过载。所以我们做了一个
            更简单、更快的工作台，把整条研究链路变得轻松。”
          </p>
          <div className="flex flex-col items-center justify-center">
            <div className="bg-muted relative mb-4 h-20 w-20 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/landing/founder.jpg"
                alt="MetaInsight 创始人"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="text-foreground text-sm font-medium">
              MetaInsight 团队
            </div>
            <div className="text-foreground/50 text-sm font-light">
              智能投研工作台
            </div>
          </div>
          <div className="mt-20 flex flex-col items-center">
            <h3 className="text-foreground/80 mb-8 font-serif text-2xl font-medium tracking-[-0.02em] md:text-3xl">
              感同身受？
            </h3>
            <Link
              href="/workspace"
              className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2 rounded-sm px-8 py-4 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 md:text-base"
            >
              今天就开始你的第一次研究
              <ArrowRightIcon width={16} height={16} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
