import { describe, expect, it } from "@rstest/core";

import {
  formatWeatherDay,
  roundWeatherCoordinate,
  weatherCondition,
} from "@/core/weather";

describe("weather presentation helpers", () => {
  it("maps WMO weather codes into concise Chinese conditions", () => {
    expect(weatherCondition(0)).toEqual({ icon: "clear", label: "晴" });
    expect(weatherCondition(2)).toEqual({
      icon: "partly-cloudy",
      label: "多云",
    });
    expect(weatherCondition(61)).toEqual({ icon: "rain", label: "有雨" });
    expect(weatherCondition(80)).toEqual({ icon: "rain", label: "阵雨" });
    expect(weatherCondition(95)).toEqual({ icon: "storm", label: "雷雨" });
  });

  it("keeps location requests at city-level precision", () => {
    expect(roundWeatherCoordinate(31.230416)).toBe(31.23);
    expect(roundWeatherCoordinate(121.473701)).toBe(121.47);
  });

  it("labels the first forecast day as today", () => {
    expect(formatWeatherDay("2026-07-19", 0)).toBe("今天");
    expect(formatWeatherDay("not-a-date", 1)).toBe("not-a-date");
  });
});
