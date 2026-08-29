"use client";

import { useQuery } from "@tanstack/react-query";

import { fetch } from "@/core/api/fetcher";

export interface DailyPnlPoint {
  date: string;
  equity: number;
  pnl: number;
  pnl_pct: number | null;
}

export function useDailyPnlSeries(days = 120) {
  return useQuery({
    queryKey: ["stock-daily-pnl", days],
    queryFn: async () => {
      const response = await fetch(`/stock-api/portfolio/daily-pnl?days=${days}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`daily-pnl failed: ${response.statusText}`);
      const payload = (await response.json()) as {
        series: DailyPnlPoint[];
        account_count: number;
      };
      return payload;
    },
    staleTime: 60_000,
  });
}
