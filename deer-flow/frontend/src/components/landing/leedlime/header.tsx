"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { BRAND_NAME } from "@/core/brand";

const NAV_LINKS = [
  { href: "#how-it-works", label: "产品原理" },
  { href: "#pricing", label: "方案" },
  { href: "#faq", label: "常见问题" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-border bg-background/90 sticky top-0 z-50 flex w-full flex-col border-b backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between px-8 md:px-12">
        <Link
          href="/"
          className="text-foreground flex shrink-0 items-center gap-2.5 font-sans text-xl transition-opacity select-none hover:opacity-80"
        >
          <BrandMark className="pointer-events-none h-6 w-6" />
          {BRAND_NAME}
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-12 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-foreground/80 hover:text-foreground text-sm font-medium transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-6 md:flex">
          <Link
            href="/login"
            className="text-foreground/70 hover:text-foreground text-sm font-medium transition-colors duration-200"
          >
            登录
          </Link>
          <Link
            href="/workspace"
            className="buttonfloat bg-foreground text-background inline-flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
          >
            进入工作台
          </Link>
        </div>

        <div className="md:hidden">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-foreground relative z-50 rounded-full border border-neutral-200 bg-white/50 p-2 backdrop-blur-md focus:outline-none"
            aria-label="切换菜单"
          >
            <MenuIcon width={20} height={20} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-border bg-background flex flex-col gap-1 border-t px-8 py-4 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-foreground/80 hover:text-foreground py-2 text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/workspace"
            className="bg-foreground text-background mt-2 inline-flex items-center justify-center rounded-sm px-4 py-2 text-sm font-medium"
          >
            进入工作台
          </Link>
        </div>
      ) : null}
    </header>
  );
}
