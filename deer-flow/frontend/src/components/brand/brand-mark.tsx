import Image from "next/image";

import {
  BRAND_LOGO_SRC,
  BRAND_MARK_SRC,
  BRAND_NAME,
} from "@/core/brand";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "alt"> & { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative brand mark; sized by className
    <img
      src={BRAND_MARK_SRC}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      {...props}
    />
  );
}

export function BrandLockup({
  className,
  markClassName,
  nameClassName,
  showName = true,
}: {
  className?: string;
  markClassName?: string;
  nameClassName?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark className={cn("h-7 w-auto", markClassName)} />
      {showName ? (
        <span
          className={cn(
            "font-semibold tracking-[-0.03em] text-[#0B2A5B]",
            nameClassName,
          )}
        >
          {BRAND_NAME}
          <span className="sr-only"> home</span>
        </span>
      ) : null}
    </span>
  );
}

export function BrandWordmark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      width={512}
      height={512}
      priority={priority}
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}
