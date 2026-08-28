import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getStockEquitySeries,
  getStockPortfolioDashboard,
  getStockPortfolioRisk,
} from "./api";

export function useStockPortfolioDashboard() {
  return useQuery({
    queryKey: ["stock-portfolio-dashboard"],
    queryFn: getStockPortfolioDashboard,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    // Keep the last successful result during background refetches so the
    // dashboard never blanks back to the demo set while polling.
    placeholderData: keepPreviousData,
  });
}

/** Risk metrics load independently so the slow endpoint never blocks render. */
export function useStockPortfolioRisk() {
  return useQuery({
    queryKey: ["stock-portfolio-risk"],
    queryFn: getStockPortfolioRisk,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}

/** Equity curve for the earnings view. */
export function useStockEquitySeries(days = 30) {
  return useQuery({
    queryKey: ["stock-equity-series", days],
    queryFn: () => getStockEquitySeries(days),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: keepPreviousData,
  });
}
