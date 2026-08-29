import { fetch } from "@/core/api/fetcher";
import type {
  PortfolioDashboard,
  PortfolioDashboardItem,
  PortfolioPosition,
} from "@/core/finance";

import type {
  EquityPoint,
  StockRiskResponse,
  StockSnapshotResponse,
} from "./types";

const BASE = "/stock-api";

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Stock service ${path} failed: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** PortfolioPosition enriched with live valuation fields from the service. */
export type EnrichedPosition = PortfolioPosition & {
  lastPrice?: string;
  marketValue?: string;
  unrealizedPnl?: string;
  unrealizedPnlPct?: number | null;
};

function mapPosition(
  position: StockSnapshotResponse["accounts"][number]["positions"][number],
  accountId: number,
  asOf: string,
  name: string,
): EnrichedPosition {
  return {
    id: `${accountId}-${position.symbol}`,
    portfolioId: String(accountId),
    market: position.market,
    symbol: position.symbol,
    name: name || position.symbol,
    quantity: String(position.quantity),
    averageCost: String(position.avg_cost),
    currency: position.currency,
    source: "stock-server",
    asOf,
    lastPrice: String(position.last_price),
    marketValue: String(position.market_value_base),
    unrealizedPnl: String(position.unrealized_pnl_base),
    unrealizedPnlPct: position.unrealized_pnl_pct,
  };
}

/** Resolve display names for symbols via the history endpoint (cached, fast). */
export async function getStockSymbolNames(
  symbols: string[],
): Promise<Record<string, string>> {
  return fetchSymbolNames(symbols);
}

async function fetchSymbolNames(
  symbols: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const history = await getJSON<{ stock_name?: string }>(
          `/stocks/${encodeURIComponent(symbol)}/history`,
        );
        return [symbol, history.stock_name ?? ""] as const;
      } catch {
        return [symbol, ""] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function mapAccount(
  account: StockSnapshotResponse["accounts"][number],
  risk: StockRiskResponse | null,
  names: Record<string, string>,
): PortfolioDashboardItem {
  const equity = account.total_equity;
  const cashWeight = equity > 0 ? account.total_cash / equity : null;
  const unrealizedReturn =
    account.total_market_value + account.total_cash > 0 && equity > 0
      ? account.unrealized_pnl / (equity - account.unrealized_pnl || 1)
      : null;
  const maxDrawdownPct = risk?.drawdown?.max_drawdown_pct;

  return {
    portfolio: {
      id: String(account.account_id),
      name: account.account_name,
      purpose: account.broker ? `${account.broker} · ${account.market}` : account.market,
      baseCurrency: account.base_currency,
      benchmark: null,
      status: "active",
      revision: 1,
      createdAt: account.as_of,
      updatedAt: account.as_of,
      archivedAt: null,
    },
    strategyCount: 0,
    activeStrategy: null,
    positions: account.positions.map((p) =>
      mapPosition(p, account.account_id, account.as_of, names[p.symbol] ?? ""),
    ),
    cashBalances: [
      {
        id: `cash-${account.account_id}`,
        portfolioId: String(account.account_id),
        currency: account.base_currency,
        amount: String(account.total_cash),
        source: "stock-server",
        asOf: account.as_of,
      },
    ],
    latestSnapshot: {
      id: `snap-${account.account_id}`,
      portfolioId: String(account.account_id),
      strategyVersionId: null,
      sessionDate: account.as_of,
      dataRevision: 1,
      portfolioRevision: 1,
      status: "final",
      baseCurrency: account.base_currency,
      holdingsValue: String(account.total_market_value),
      cashValue: String(account.total_cash),
      totalEquity: String(account.total_equity),
      inputHash: "",
      marketDataHash: "",
      snapshotHash: "",
      formulaVersion: "1",
      payload: {},
      dataGaps: [],
      dataCutoff: account.as_of,
      createdAt: account.as_of,
    },
    latestReview: null,
    performance: {
      status: "complete",
      periodStart: account.as_of,
      periodEnd: account.as_of,
      snapshotCount: 1,
      returnIntervalCount: 0,
      dailyReturn: null,
      dailyPnl: null,
      cumulativeReturn:
        unrealizedReturn != null ? String(unrealizedReturn) : null,
      maxDrawdown:
        maxDrawdownPct != null ? String(maxDrawdownPct / 100) : null,
      annualizedVolatility: null,
      unrealizedPnl: String(account.unrealized_pnl),
      unrealizedReturn:
        unrealizedReturn != null ? String(unrealizedReturn) : null,
      cashWeight: cashWeight != null ? String(cashWeight) : null,
      dataGaps: [],
      live: true,
    },
  };
}

/** Fetch the real portfolio dashboard from daily-stock-analysis.
 *
 * Uses `include_realtime=false` so the service reads its locally cached
 * historical closes instead of pulling live quotes from external providers on
 * every call — this cuts the snapshot from ~14s to ~30ms.
 */
export async function getStockPortfolioDashboard(): Promise<PortfolioDashboard> {
  // Snapshot reads cached historical closes (~30ms). Symbol names come from
  // the cached history endpoint (~200ms each, parallel). Risk metrics are
  // loaded separately (see getStockPortfolioRisk) since that endpoint is slow.
  const snapshot = await getJSON<StockSnapshotResponse>(
    "/portfolio/snapshot?include_realtime=false",
  );

  const symbols = [
    ...new Set(
      (snapshot.accounts ?? []).flatMap((account) =>
        account.positions.map((p) => p.symbol),
      ),
    ),
  ];
  const names = await fetchSymbolNames(symbols);

  const portfolios = (snapshot.accounts ?? []).map((account) =>
    mapAccount(account, null, names),
  );

  return {
    summary: {
      portfolioCount: portfolios.length,
      activeCount: portfolios.length,
      withStrategyCount: 0,
      withSnapshotCount: portfolios.length,
    },
    portfolios,
  };
}

/** Fetch risk metrics (max drawdown etc.) — slower endpoint, load async. */
export async function getStockPortfolioRisk(): Promise<StockRiskResponse | null> {
  try {
    return await getJSON<StockRiskResponse>(
      "/portfolio/risk?include_realtime=false",
    );
  } catch {
    return null;
  }
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build the portfolio equity curve by sampling historical snapshots.
 *
 * The service has no dedicated series endpoint, but `snapshot?as_of=<date>`
 * reads cached closes cheaply, so we sample one point per day over the window.
 */
export async function getStockEquitySeries(days = 30): Promise<EquityPoint[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(toISODate(d));
  }

  const points = await Promise.all(
    dates.map(async (date) => {
      try {
        const snap = await getJSON<StockSnapshotResponse>(
          `/portfolio/snapshot?include_realtime=false&as_of=${date}`,
        );
        const equity = snap.accounts?.[0]?.total_equity;
        return typeof equity === "number" && equity > 0
          ? ({ date, equity } as EquityPoint)
          : null;
      } catch {
        return null;
      }
    }),
  );

  return points.filter((p): p is EquityPoint => p !== null);
}
