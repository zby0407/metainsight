/** daily-stock-analysis portfolio service data shapes (snake_case as served). */

export interface StockPosition {
  symbol: string;
  market: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  total_cost: number;
  last_price: number;
  market_value_base: number;
  unrealized_pnl_base: number;
  unrealized_pnl_pct: number | null;
  valuation_currency: string;
  price_available: boolean;
  price_stale: boolean;
  data_quality: string;
}

export interface StockAccountSnapshot {
  account_id: number;
  account_name: string;
  broker: string | null;
  market: string;
  base_currency: string;
  as_of: string;
  total_cash: number;
  total_market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  data_quality: string;
  positions: StockPosition[];
}

export interface StockSnapshotResponse {
  as_of: string;
  currency: string;
  account_count: number;
  total_cash: number;
  total_market_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  data_quality: string;
  accounts: StockAccountSnapshot[];
}

export interface StockRiskTopPosition {
  symbol?: string;
  market_value_base?: number;
  weight_pct?: number;
  is_alert?: boolean;
}

export interface StockRiskTopSector {
  sector?: string;
  market_value_base?: number;
  weight_pct?: number;
  symbol_count?: number;
  is_alert?: boolean;
}

export interface StockRiskResponse {
  as_of: string;
  currency: string;
  concentration?: {
    total_market_value: number;
    top_weight_pct: number;
    alert: boolean;
    top_positions?: StockRiskTopPosition[];
  };
  sector_concentration?: {
    total_market_value: number;
    top_weight_pct: number;
    alert: boolean;
    top_sectors?: StockRiskTopSector[];
  };
  drawdown?: {
    max_drawdown_pct?: number;
    current_drawdown_pct?: number;
    alert?: boolean;
  };
  stop_loss?: {
    near_alert?: boolean;
    triggered_count?: number;
    near_count?: number;
  };
  thresholds?: Record<string, number>;
  [key: string]: unknown;
}

/** A single point on the portfolio equity curve. */
export interface EquityPoint {
  date: string;
  equity: number;
}
