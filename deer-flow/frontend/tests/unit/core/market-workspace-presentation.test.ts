import { describe, expect, it } from "@rstest/core";

import {
  aShareSessionStatus,
  deriveIndexBreadth,
  describeSectorRotation,
  indexRangePosition,
  resolveMarketStats,
  sparklinePath,
  temperatureTone,
} from "@/core/finance/market-workspace-presentation";

const indices = [
  {
    code: "sh000001",
    name: "上证指数",
    current: 3912.52,
    change: 23.1,
    change_pct: 0.59,
    open: 3890,
    high: 3920,
    low: 3880,
    amount: 4.2e11,
    amplitude: 1.02,
  },
  {
    code: "sz399001",
    name: "深证成指",
    current: 13841.33,
    change: 95,
    change_pct: 0.69,
    open: 13700,
    high: 13880,
    low: 13680,
    amount: 5.1e11,
    amplitude: 1.44,
  },
  {
    code: "sz399006",
    name: "创业板指",
    current: 3414.88,
    change: -12,
    change_pct: -0.35,
    open: 3420,
    high: 3430,
    low: 3390,
    amount: 1.8e11,
    amplitude: 1.17,
  },
];

describe("market workspace presentation", () => {
  it("derives breadth from major indices when the full tape is missing", () => {
    const derived = deriveIndexBreadth(indices);
    expect(derived.rising).toBe(2);
    expect(derived.falling).toBe(1);
    expect(derived.leader?.name).toBe("深证成指");

    const stats = resolveMarketStats(null, indices);
    expect(stats.source).toBe("主要指数");
    expect(stats.upCount).toBe(2);
    expect(stats.downCount).toBe(1);
    expect(stats.upRatio).toBeCloseTo((2 / 3) * 100);
    expect(stats.turnover).toContain("亿");
  });

  it("keeps official breadth when the tape has actually arrived", () => {
    const stats = resolveMarketStats(
      {
        up_count: 3200,
        down_count: 1800,
        flat_count: 200,
        limit_up_count: 41,
        limit_down_count: 8,
        total_amount: 1.2,
        turnover_unit: "万亿",
      },
      indices,
    );
    expect(stats.source).toBe("全市场");
    expect(stats.upCount).toBe(3200);
    expect(stats.limitUp).toBe(41);
    expect(stats.turnover).toContain("万亿");
  });

  it("builds sparkline paths, range markers, and sector rotation copy", () => {
    expect(sparklinePath([10, 12, 11])).toMatch(/^M/);
    expect(sparklinePath([1])).toBeNull();
    expect(indexRangePosition(indices[0]!)).toBeGreaterThan(50);
    expect(temperatureTone(54)).toBe("neutral");
    expect(
      describeSectorRotation(
        [{ name: "半导体", change_pct: 3.2 }],
        [{ name: "银行", change_pct: -1.1 }],
      ),
    ).toContain("成长");
  });

  it("labels the A-share session in Beijing time", () => {
    const mondayOpen = new Date("2026-08-24T02:00:00Z");
    const status = aShareSessionStatus(mondayOpen);
    expect(status.label).toBe("早盘交易");
    expect(status.live).toBe(true);
  });
});
