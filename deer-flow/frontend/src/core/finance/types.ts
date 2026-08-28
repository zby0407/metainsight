export interface PortfolioDashboardSummary {
  portfolioCount: number;
  activeCount: number;
  withStrategyCount: number;
  withSnapshotCount: number;
}

export interface PortfolioSummary {
  id: string;
  name: string;
  purpose: string;
  baseCurrency: string;
  benchmark: string | null;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface StrategyVersionSummary {
  id: string;
  portfolioId: string;
  version: number;
  status: "draft" | "approved" | "active" | "retired";
  objective: string;
  horizon: string;
  benchmark: string | null;
  policy: Record<string, unknown>;
  createdFromId: string | null;
  approvedAt: string | null;
  effectiveFrom: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioPosition {
  id: string;
  portfolioId: string;
  market: string;
  symbol: string;
  name: string;
  quantity: string;
  averageCost: string;
  currency: string;
  source: string;
  asOf: string;
}

export interface PortfolioCashBalance {
  id: string;
  portfolioId: string;
  currency: string;
  amount: string;
  source: string;
  asOf: string;
}

export interface PortfolioSnapshotSummary {
  id: string;
  portfolioId: string;
  strategyVersionId: string | null;
  sessionDate: string;
  dataRevision: number;
  portfolioRevision: number;
  status: "partial" | "final";
  baseCurrency: string;
  holdingsValue: string;
  cashValue: string;
  totalEquity: string;
  inputHash: string;
  marketDataHash: string;
  snapshotHash: string;
  formulaVersion: string;
  payload: Record<string, unknown>;
  dataGaps: string[];
  dataCutoff: string;
  createdAt: string;
}

export interface DailyReviewSummary {
  id: string;
  portfolioId: string;
  strategyVersionId: string;
  reviewDate: string;
  status: "draft" | "published";
  assessment: "on_track" | "watch" | "breached" | "insufficient_data";
  revision: number;
  summary: string;
  payload: Record<string, unknown>;
  evidenceIds: string[];
  dataCutoff: string;
  inputSnapshotHash: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PortfolioPerformanceSummary {
  status: "insufficient_data" | "partial" | "complete";
  periodStart: string | null;
  periodEnd: string | null;
  snapshotCount: number;
  returnIntervalCount: number;
  dailyReturn: string | null;
  dailyPnl: string | null;
  cumulativeReturn: string | null;
  maxDrawdown: string | null;
  annualizedVolatility: string | null;
  unrealizedPnl: string | null;
  unrealizedReturn: string | null;
  cashWeight: string | null;
  dataGaps: string[];
  live?: boolean;
}

export interface PortfolioDashboardItem {
  portfolio: PortfolioSummary;
  strategyCount: number;
  activeStrategy: StrategyVersionSummary | null;
  positions: PortfolioPosition[];
  cashBalances: PortfolioCashBalance[];
  latestSnapshot: PortfolioSnapshotSummary | null;
  latestReview: DailyReviewSummary | null;
  workspaceBriefs?: {
    risk: string;
    strategy: string;
    sandbox: string;
  };
  performance?: PortfolioPerformanceSummary;
}

export interface PortfolioDashboard {
  summary: PortfolioDashboardSummary;
  portfolios: PortfolioDashboardItem[];
}

export interface PortfolioSetupPositionInput {
  market: string;
  symbol: string;
  name: string;
  quantity: string;
  averageCost: string;
  currency: string;
}

export interface PortfolioSetupCashInput {
  currency: string;
  amount: string;
}

export interface PortfolioSetupRequest {
  idempotencyKey: string;
  portfolio: {
    name: string;
    purpose: string;
    baseCurrency: string;
    benchmark: string | null;
  };
  account: {
    asOf: string;
    source: string;
    positions: PortfolioSetupPositionInput[];
    cashBalances: PortfolioSetupCashInput[];
  };
  strategy: {
    objective: string;
    horizon: string;
    benchmark: string | null;
    policy: Record<string, unknown>;
    activate: boolean;
  } | null;
  captureSnapshot: boolean;
}

export interface PortfolioSetupResponse {
  idempotentReplay: boolean;
  portfolio: PortfolioSummary;
  account: {
    portfolioId: string;
    portfolioRevision: number;
    baseCurrency: string;
    positions: PortfolioPosition[];
    cashBalances: PortfolioCashBalance[];
  };
  strategy: StrategyVersionSummary | null;
  snapshot: PortfolioSnapshotSummary | null;
  snapshotError: string | null;
}
