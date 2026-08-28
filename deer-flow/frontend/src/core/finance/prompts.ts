import type { PortfolioSummary } from "./types";

function portfolioReference(portfolio: PortfolioSummary) {
  return `「${portfolio.name}」（ID：${portfolio.id}）`;
}

export function createPortfolioReviewPrompt(portfolio: PortfolioSummary) {
  return `复盘组合${portfolioReference(portfolio)}今天的策略。`;
}

export function createPortfolioRiskPrompt(portfolio: PortfolioSummary) {
  return `检查组合${portfolioReference(portfolio)}当前的主要风险。`;
}

export function createPortfolioStrategyPrompt(portfolio: PortfolioSummary) {
  return `帮我优化组合${portfolioReference(portfolio)}的投资策略。`;
}

export function createPortfolioSandboxPrompt(portfolio: PortfolioSummary) {
  return `为组合${portfolioReference(portfolio)}创建一个模拟沙盘。`;
}

export function createPortfolioSetupPrompt() {
  return "帮我创建一个投资组合。";
}

export function formatPortfolioAmount(
  value: string,
  currency: string,
  locale: string,
) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return `${value} ${currency}`;
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
  }
}
