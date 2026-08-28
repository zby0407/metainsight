"use client";

import { CircleHelpIcon, PlusIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { BRAND_NAME } from "@/core/brand";

export function PortfolioHeader({
  greeting,
  name,
  email,
}: {
  greeting: string;
  name: string;
  email: string;
}) {
  const initials = (name || email || "MI").slice(0, 2).toUpperCase();

  return (
    <header className="border-border bg-background/90 sticky top-0 z-40 flex h-16 w-full shrink-0 items-center justify-between border-b px-8 backdrop-blur-md md:px-12">
      <Link
        href="/"
        className="text-foreground flex items-center gap-2.5 font-sans text-xl transition-opacity select-none hover:opacity-80"
      >
        <BrandMark className="pointer-events-none h-6 w-6" />
        {BRAND_NAME}
      </Link>

      <div className="absolute left-1/2 hidden -translate-x-1/2 md:block">
        <p className="text-foreground/80 text-sm font-medium">
          {greeting}
          {name ? `，${name}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="text-foreground/60 hover:text-foreground hover:bg-muted flex size-9 items-center justify-center rounded-lg transition-colors"
          aria-label="添加"
        >
          <PlusIcon className="size-4" />
        </button>
        <button
          className="text-foreground/60 hover:text-foreground hover:bg-muted flex size-9 items-center justify-center rounded-lg transition-colors"
          aria-label="帮助"
        >
          <CircleHelpIcon className="size-4" />
        </button>
        <button
          className="text-foreground/60 hover:text-foreground hover:bg-muted flex size-9 items-center justify-center rounded-lg transition-colors"
          aria-label="设置"
        >
          <SettingsIcon className="size-4" />
        </button>
        <div
          className="bg-foreground text-background ml-2 flex size-9 items-center justify-center rounded-full text-xs font-semibold"
          title={email}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
