import Link from "next/link";

import { BrandLockup } from "@/components/brand/brand-mark";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/core/brand";
import { cn } from "@/lib/utils";

const FOOTER_GROUPS = [
  {
    title: "产品",
    links: [
      { href: "/workspace", label: "工作台" },
      { href: "/workspace/market", label: "市场" },
      { href: "/workspace/watchlist", label: "自选" },
    ],
  },
  {
    title: "内容",
    links: [
      { href: "/workspace/chats", label: "对话记录" },
      { href: "/blog", label: "博客" },
    ],
  },
] as const;

export type FooterProps = {
  className?: string;
};

export function Footer({ className }: FooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer className={cn("border-line bg-cream w-full border-t", className)}>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <BrandLockup markClassName="h-7" nameClassName="text-ink text-lg" />
          <p className="text-ink/60 mt-4 max-w-sm text-sm leading-6">
            {BRAND_DESCRIPTION}
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-ink text-sm font-semibold">{group.title}</p>
            <ul className="mt-4 space-y-3">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-ink/60 hover:text-ink text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-line border-t">
        <div className="text-ink/50 mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {year} {BRAND_NAME}
          </p>
          <p>页面数据仅用于产品演示，不构成任何投资建议。</p>
        </div>
      </div>
    </footer>
  );
}
