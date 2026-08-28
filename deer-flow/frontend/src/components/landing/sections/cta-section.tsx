import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

export function CtaSection() {
  return (
    <section className="bg-cream w-full px-6 py-20 md:py-28">
      <div className="bg-ink relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-8 py-14 md:px-14 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_20%_0%,black_5%,transparent_65%)]"
        />
        <BrandMark className="pointer-events-none absolute -right-8 -bottom-10 h-56 w-auto opacity-15 mix-blend-screen md:h-72" />

        <div className="relative max-w-xl">
          <h2 className="text-cream font-[family-name:var(--font-mi-serif)] text-3xl leading-[1.1] font-normal tracking-[-0.02em] md:text-[2.5rem]">
            现在就开始你的第一次研究
          </h2>
          <p className="text-cream/70 mt-4 text-[15px] leading-7">
            打开工作台，从一支标的、一个板块或一条资讯出发，几分钟内得到一份有依据的判断。
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/workspace"
              className="bg-cream text-ink group inline-flex h-12 items-center gap-2 rounded-lg px-7 text-[15px] font-medium transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              进入工作台
              <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="border-line-dark text-cream/80 inline-flex h-12 items-center rounded-lg border bg-transparent px-7 text-[15px] font-medium transition-colors hover:bg-white/10 hover:text-cream"
            >
              登录已有账号
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
