"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandLockup } from "@/components/brand/brand-mark";
import type { Locale } from "@/core/i18n/locale";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/workspace/market", label: "市场" },
  { href: "/workspace/watchlist", label: "自选" },
  { href: "/blog", label: "博客" },
] as const;

export type HeaderProps = {
  className?: string;
  homeURL?: string;
  locale?: Locale;
};

export function Header({ className, homeURL }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 z-40 transition-all duration-300",
        scrolled
          ? "border-line bg-cream/90 border-b backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
        className,
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-6">
        <Link
          href={homeURL ?? "/"}
          aria-label="MetaInsight 首页"
          className="transition-opacity hover:opacity-80"
        >
          <BrandLockup markClassName="h-7" nameClassName="text-ink text-lg" />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-ink/70 hover:text-ink hover:bg-ink/5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/login"
            className="text-ink/70 hover:text-ink hidden px-3 text-sm font-medium transition-colors sm:block"
          >
            登录
          </Link>
          <Link
            href="/workspace"
            className="bg-ink text-cream hover:bg-ink-soft inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium shadow-[0_1px_2px_rgba(22,20,18,0.1)] transition-colors"
          >
            进入工作台
          </Link>
        </div>
      </div>
    </header>
  );
}
