import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@rstest/core";

const newsWorkspace = readFileSync(
  join(process.cwd(), "src", "components", "news", "news-workspace.tsx"),
  "utf8",
);
const localWeatherRail = readFileSync(
  join(process.cwd(), "src", "components", "news", "local-weather-rail.tsx"),
  "utf8",
);

describe("news workspace presentation", () => {
  it("keeps the right rail complementary to the main event stream", () => {
    expect(newsWorkspace).not.toContain("今日热榜");
    expect(newsWorkspace).not.toContain("getNewsRankings");
    expect(newsWorkspace).not.toContain("今日概览");
    expect(newsWorkspace).not.toContain('["top", "latest"]');
    expect(newsWorkspace).not.toContain('searchParams.get("sort")');
    expect(newsWorkspace).not.toContain("头条");
    expect(newsWorkspace).toContain("<NewsPreferencesDialog");
    expect(newsWorkspace).toContain("关注设置");
    expect(newsWorkspace).toContain("<LocalWeatherRail />");
    expect(newsWorkspace).toContain("<MarketRail />");
    expect(localWeatherRail).toContain("/workspace/weather-data?");
    expect(localWeatherRail).not.toContain("/api/weather");
    expect(localWeatherRail).toContain(
      "roundWeatherCoordinate(location.latitude)",
    );
  });
});
