import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { QueryClientProvider } from "@/components/query-client-provider";

import { WorkspaceShell } from "./workspace-shell";

function parseSidebarOpenCookie(
  value: string | undefined,
): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function WorkspaceContent({
  children,
  gatewayUnavailable = false,
}: Readonly<{
  children: React.ReactNode;
  gatewayUnavailable?: boolean;
}>) {
  const cookieStore = await cookies();
  const initialSidebarOpen = parseSidebarOpenCookie(
    cookieStore.get("sidebar_state")?.value,
  );

  return (
    <QueryClientProvider>
      <WorkspaceShell
        initialSidebarOpen={initialSidebarOpen}
        gatewayUnavailable={gatewayUnavailable}
      >
        {children}
      </WorkspaceShell>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
