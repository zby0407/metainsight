import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@rstest/core";

const source = (path: string) =>
  readFileSync(join(process.cwd(), "src", path), "utf8");

describe("post-close DSA notification integration", () => {
  it("keeps the persistent inbox mounted in the workspace sidebar", () => {
    const navigation = source("components/workspace/workspace-nav-menu.tsx");

    expect(navigation).toContain("ResearchNotificationCenter");
    expect(navigation).toContain(
      "<ResearchNotificationCenter isSidebarOpen={isSidebarOpen} />",
    );
  });

  it("reuses the built-in desktop notification hook for new DSA messages", () => {
    const inbox = source(
      "components/workspace/research-notification-center.tsx",
    );

    expect(inbox).toContain(
      'useNotification } from "@/core/notification/hooks"',
    );
    expect(inbox).toContain("/api/v1/notifications?limit=30");
    expect(inbox).toContain("showNotification(");
    expect(inbox).toContain('document.visibilityState !== "visible"');
  });

  it("keeps automatic DSA settings available from the watchlist", () => {
    const watchlist = source("components/market/watchlist-workspace.tsx");

    expect(watchlist).toContain("DsaAutoResearchPanel");
    expect(watchlist).toContain("stocks={(data?.rows ?? []).map");
    expect(watchlist).not.toContain(
      "<DsaAutoResearchPanel\n                stocks={data.rows.map",
    );
  });

  it("keeps the watchlist presentation flat and research-led", () => {
    const watchlist = source("components/market/watchlist-workspace.tsx");
    const automation = source("components/market/dsa-auto-research-panel.tsx");

    expect(watchlist).not.toContain('from "@/components/ui/card"');
    expect(automation).not.toContain('from "@/components/ui/card"');
    expect(watchlist).toContain("function WatchlistSummary");
    expect(watchlist).toContain("<polyline");
    expect(automation).toContain("收盘自动研究");
  });

  it("renders expanded research directly after its watchlist row", () => {
    const watchlist = source("components/market/watchlist-workspace.tsx");

    expect(watchlist).toContain("<Fragment key={row.code}>");
    expect(watchlist).toContain('className="border-t p-0" colSpan={7}');
    expect(watchlist).not.toContain(
      "filteredRows.find((row) => row.code === expandedCode)",
    );
  });
});
