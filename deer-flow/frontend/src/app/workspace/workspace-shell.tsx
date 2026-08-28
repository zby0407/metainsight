"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/workspace/command-palette";
import { GatewayOfflineBanner } from "@/components/workspace/gateway-offline-banner";
import { RiskProfileGate } from "@/components/workspace/risk-profile-gate";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";

/**
 * Renders the portfolio home (three-column dashboard) without the legacy
 * sidebar on the exact `/workspace` route; every other workspace route keeps
 * the existing sidebar shell (chats, etc.).
 */
export function WorkspaceShell({
  children,
  initialSidebarOpen,
  gatewayUnavailable = false,
}: {
  children: ReactNode;
  initialSidebarOpen?: boolean;
  gatewayUnavailable?: boolean;
}) {
  const pathname = usePathname();
  const isPortfolioHome =
    pathname === "/workspace" || pathname === "/workspace/";

  if (isPortfolioHome) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider
      className="mi-workbench h-screen"
      defaultOpen={initialSidebarOpen}
    >
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <GatewayOfflineBanner gatewayUnavailable={gatewayUnavailable} />
        <RiskProfileGate>{children}</RiskProfileGate>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
