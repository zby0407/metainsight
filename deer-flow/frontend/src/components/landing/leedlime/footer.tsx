import { LinkedinIcon, TwitterIcon } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { BRAND_NAME } from "@/core/brand";

const GROUPS = [
  {
    title: "产品",
    links: [
      { href: "#how-it-works", label: "产品原理" },
      { href: "#pricing", label: "方案" },
      { href: "#faq", label: "常见问题" },
      { href: "/workspace", label: "进入工作台" },
    ],
  },
  {
    title: "公司",
    links: [
      { href: "/blog", label: "博客" },
      { href: "/workspace/market", label: "市场" },
      { href: "/workspace/watchlist", label: "自选" },
    ],
  },
  {
    title: "条款",
    links: [
      { href: "#", label: "隐私政策" },
      { href: "#", label: "服务条款" },
      { href: "#", label: "免责声明" },
    ],
  },
] as const;

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border bg-background text-foreground relative flex min-h-[500px] w-full flex-col justify-between border-none">
      <div className="z-10 w-full px-8 pt-24 md:px-12">
        <div className="mb-20 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="text-foreground mb-6 inline-flex items-center gap-2 font-sans text-2xl transition-opacity hover:opacity-80"
            >
              <BrandMark className="h-6 w-6" />
              {BRAND_NAME}
            </Link>
            <p className="text-foreground/70 mb-8 max-w-sm text-base leading-relaxed font-light">
              从市场数据，到投资判断。准确、实时、可回溯的智能投研工作台。
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                aria-label="X (Twitter)"
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <TwitterIcon width={20} height={20} />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="text-foreground/50 hover:text-foreground transition-colors"
              >
                <LinkedinIcon width={20} height={20} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:col-span-4">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-eyebrow text-foreground/50 mb-6">
                  {group.title}
                </h3>
                <ul className="space-y-4">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-foreground/80 hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-col items-center justify-between gap-6 border-none pt-8 pb-20 md:flex-row">
          <div className="text-foreground/50 z-20 shrink-0 text-sm">
            © {year} {BRAND_NAME} · 页面数据仅用于产品演示，不构成投资建议
          </div>
          <div className="z-20 flex shrink-0 items-center gap-6">
            <Link
              href="/login"
              className="text-foreground/50 hover:text-foreground text-sm transition-colors"
            >
              登录
            </Link>
            <Link
              href="/workspace"
              className="text-foreground/90 hover:text-foreground text-sm font-medium transition-colors"
            >
              进入工作台 →
            </Link>
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative mt-auto w-full">
        <div className="from-background absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b to-transparent" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/landing/lime-field-paint.jpg"
          alt=""
          aria-hidden
          className="block h-auto w-full object-cover opacity-90"
        />
      </div>
    </footer>
  );
}
