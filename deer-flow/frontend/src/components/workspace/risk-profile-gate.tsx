"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AUTH_DISABLED_USER } from "@/core/auth/auth-disabled-user";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  hasCompletedRiskProfile,
  readStoredRiskProfile,
  RISK_PROFILE_PATH,
} from "@/core/finance/risk-profile";
import { syncRiskProfileToMemory } from "@/core/finance/risk-profile-memory";
import { useI18n } from "@/core/i18n/hooks";
import { isStaticWebsiteOnly } from "@/core/static-mode";

function shouldSkipRiskProfileGate(userId: string | undefined) {
  if (!userId) return true;
  if (isStaticWebsiteOnly()) return true;
  return userId === AUTH_DISABLED_USER.id;
}

export function RiskProfileGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
  const [ready, setReady] = useState(() =>
    shouldSkipRiskProfileGate(user?.id),
  );

  useLayoutEffect(() => {
    if (shouldSkipRiskProfileGate(user?.id)) {
      setReady(true);
      return;
    }
    if (pathname === RISK_PROFILE_PATH) {
      setReady(true);
      return;
    }
    if (user?.id && hasCompletedRiskProfile(user.id)) {
      setReady(true);
      return;
    }
    setReady(false);
    router.replace(RISK_PROFILE_PATH);
  }, [pathname, router, user?.id]);

  useEffect(() => {
    if (shouldSkipRiskProfileGate(user?.id) || !user?.id) return;
    const stored = readStoredRiskProfile(user.id);
    if (!stored) return;
    void syncRiskProfileToMemory(stored, locale).catch(() => {
      // Keep the workspace usable even if memory write is temporarily unavailable.
    });
  }, [locale, user?.id]);

  if (!ready) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center bg-[linear-gradient(165deg,#F7FBFF_0%,#EEF5FF_45%,#E4EEFF_100%)]">
        <p className="text-sm text-[#0B2A5B]/60">正在进入风险偏好测评…</p>
      </div>
    );
  }

  return children;
}
