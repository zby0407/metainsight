import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import type {
  PortfolioDashboard,
  PortfolioSetupRequest,
  PortfolioSetupResponse,
} from "./types";

export async function getPortfolioDashboard(): Promise<PortfolioDashboard> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/finance/portfolio-dashboard`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      detail?: string;
    };
    throw new Error(
      error.detail ?? `Failed to load portfolios: ${response.statusText}`,
    );
  }
  return response.json() as Promise<PortfolioDashboard>;
}

export async function completePortfolioSetup(
  setup: PortfolioSetupRequest,
): Promise<PortfolioSetupResponse> {
  const response = await fetch(
    `${getBackendBaseURL()}/api/finance/portfolio-setup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setup),
    },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      detail?: string | { msg?: string }[];
    };
    const detail = Array.isArray(error.detail)
      ? error.detail
          .map((item) => item.msg)
          .filter(Boolean)
          .join("; ")
      : error.detail;
    throw new Error(
      detail ?? `Failed to create portfolio: ${response.statusText}`,
    );
  }
  return response.json() as Promise<PortfolioSetupResponse>;
}
