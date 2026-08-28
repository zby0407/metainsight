import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="border-border bg-background text-foreground relative flex w-full flex-col items-center overflow-hidden border-none px-8 py-32 text-center md:px-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 w-full">
        <div className="from-background absolute inset-x-0 bottom-0 z-10 h-48 bg-gradient-to-t to-transparent" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/landing/clouds-painting.jpg"
          alt=""
          aria-hidden
          className="block h-[300px] w-full object-cover"
        />
      </div>

      <div className="relative z-10 mt-24 w-full max-w-3xl">
        <Reveal>
          <h2 className="text-foreground mt-20 mb-8 font-serif font-normal text-4xl leading-[1.05] tracking-[-0.02em] text-balance md:text-5xl lg:text-[64px]">
            投研，从此前所未有的简单。
          </h2>
          <p className="text-foreground/60 mx-auto mb-12 max-w-2xl text-lg leading-relaxed font-light text-balance md:text-xl">
            现在进入工作台，几分钟内即可得到一份有依据的研究结论。
          </p>
          <div className="flex flex-col items-center gap-6">
            <Link
              href="/workspace"
              className="buttonfloat bg-foreground text-background hover:bg-foreground/90 group inline-flex w-full items-center justify-center gap-2 rounded-md px-10 py-5 text-lg font-medium shadow-sm transition-all sm:w-auto"
            >
              免费进入工作台
              <ArrowRightIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
