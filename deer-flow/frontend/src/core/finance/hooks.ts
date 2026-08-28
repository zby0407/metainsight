import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { completePortfolioSetup, getPortfolioDashboard } from "./api";

export function usePortfolioDashboard() {
  return useQuery({
    queryKey: ["finance", "portfolio-dashboard"],
    queryFn: getPortfolioDashboard,
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function usePortfolioSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completePortfolioSetup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["finance", "portfolio-dashboard"],
      });
    },
  });
}
