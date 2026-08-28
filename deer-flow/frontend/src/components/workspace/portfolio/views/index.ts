import {
  HomeIcon,
  LineChartIcon,
  PieChartIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export type PortfolioView =
  | "overview"
  | "holdings"
  | "earnings"
  | "forecast"
  | "allocation"
  | "review"
  | "risk"
  | "strategy"
  | "sandbox";

export interface TrackItem {
  view: PortfolioView;
  label: string;
  icon: LucideIcon;
  implemented: boolean;
}

export const TRACK_ITEMS: TrackItem[] = [
  { view: "overview", label: "首页", icon: HomeIcon, implemented: true },
  { view: "holdings", label: "持仓", icon: WalletIcon, implemented: true },
  { view: "earnings", label: "收益", icon: LineChartIcon, implemented: true },
  { view: "forecast", label: "预测", icon: TrendingUpIcon, implemented: false },
  { view: "allocation", label: "配置", icon: PieChartIcon, implemented: true },
];

export const SERVICE_ITEMS: { view: PortfolioView; label: string; implemented: boolean }[] = [
  { view: "review", label: "复盘报告", implemented: false },
  { view: "risk", label: "风险诊断", implemented: true },
  { view: "strategy", label: "策略建议", implemented: false },
  { view: "sandbox", label: "模拟沙盘", implemented: false },
];

export { OverviewView } from "./overview-view";
export { HoldingsView } from "./holdings-view";
export { EarningsView } from "./earnings-view";
export { AllocationView } from "./allocation-view";
export { RiskView } from "./risk-view";
