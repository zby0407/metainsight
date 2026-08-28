import { beforeEach, describe, expect, test, rs } from "@rstest/core";

rs.mock("@/core/api/fetcher", () => ({
  fetch: rs.fn(),
}));

rs.mock("@/core/config", () => ({
  getBackendBaseURL: () => "https://gateway.example",
}));

import { fetch as fetcher } from "@/core/api/fetcher";
import {
  completePortfolioSetup,
  getPortfolioDashboard,
} from "@/core/finance/api";
import { parsePortfolioCsv } from "@/core/finance/portfolio-csv";
import {
  createPortfolioReviewPrompt,
  createPortfolioRiskPrompt,
  createPortfolioSandboxPrompt,
  createPortfolioSetupPrompt,
  createPortfolioStrategyPrompt,
  formatPortfolioAmount,
} from "@/core/finance/prompts";
import type { PortfolioSummary } from "@/core/finance/types";
import {
  buildPortfolioWorkflowDisplayLabel,
  buildPortfolioWorkflowPrompt,
  createPortfolioWorkflowChatHref,
  portfolioWorkflowThreadDisplayTitle,
  readPortfolioWorkflowDisplay,
} from "@/core/finance/workflows";

const mockedFetch = rs.mocked(fetcher);

const portfolio: PortfolioSummary = {
  id: "51eea9b8-f3c2-4e48-a28c-7b51c01792bf",
  name: "长期成长组合",
  purpose: "退休资金",
  baseCurrency: "CNY",
  benchmark: "000300.SH",
  status: "active",
  revision: 3,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
  archivedAt: null,
};

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("portfolio dashboard", () => {
  test("loads the current-user projection without browser caching", async () => {
    const payload = {
      summary: {
        portfolioCount: 1,
        activeCount: 1,
        withStrategyCount: 1,
        withSnapshotCount: 1,
      },
      portfolios: [],
    };
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getPortfolioDashboard()).resolves.toEqual(payload);
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://gateway.example/api/finance/portfolio-dashboard",
      { cache: "no-store" },
    );
  });

  test("binds compact quick-action prompts to the selected portfolio", () => {
    const review = createPortfolioReviewPrompt(portfolio);
    const risk = createPortfolioRiskPrompt(portfolio);
    const strategy = createPortfolioStrategyPrompt(portfolio);
    const sandbox = createPortfolioSandboxPrompt(portfolio);

    for (const prompt of [review, risk, strategy, sandbox]) {
      expect(prompt).toContain(portfolio.name);
      expect(prompt).toContain(portfolio.id);
      expect(prompt.length).toBeLessThan(100);
    }
    expect(review).toContain("复盘");
    expect(risk).toContain("风险");
    expect(strategy).toContain("优化");
    expect(sandbox).toContain("模拟沙盘");
    expect(createPortfolioSetupPrompt()).toBe("帮我创建一个投资组合。");
  });

  test("formats portfolio values using their own currency", () => {
    expect(formatPortfolioAmount("12345.67", "CNY", "zh-CN")).toContain(
      "12,345.67",
    );
    expect(formatPortfolioAmount("not-a-number", "USD", "en-US")).toBe(
      "not-a-number USD",
    );
  });

  test("submits page-first setup as structured data", async () => {
    const setup = {
      idempotencyKey: "setup-00000001",
      portfolio: {
        name: "长期成长组合",
        purpose: "退休资金",
        baseCurrency: "CNY",
        benchmark: "000300.SH",
      },
      account: {
        asOf: "2026-07-16T04:00:00.000Z",
        source: "investment_workspace",
        positions: [],
        cashBalances: [{ currency: "CNY", amount: "1000" }],
      },
      strategy: null,
      captureSnapshot: true,
    };
    mockedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          idempotentReplay: false,
          portfolio,
          account: {
            portfolioId: portfolio.id,
            portfolioRevision: 2,
            baseCurrency: "CNY",
            positions: [],
            cashBalances: [],
          },
          strategy: null,
          snapshot: null,
          snapshotError: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    await completePortfolioSetup(setup);

    expect(mockedFetch).toHaveBeenCalledWith(
      "https://gateway.example/api/finance/portfolio-setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      },
    );
  });

  test("parses quoted CSV positions and reports invalid rows", () => {
    const valid = parsePortfolioCsv(
      [
        "market,symbol,name,quantity,averageCost,currency",
        'SH,600519,"贵州,茅台",10,1400,CNY',
      ].join("\n"),
    );
    expect(valid.errors).toEqual([]);
    expect(valid.positions[0]).toEqual({
      market: "SH",
      symbol: "600519",
      name: "贵州,茅台",
      quantity: "10",
      averageCost: "1400",
      currency: "CNY",
    });

    const invalid = parsePortfolioCsv(
      [
        "market,symbol,name,quantity,averageCost,currency",
        "SH,600519,贵州茅台,not-a-number,1400,CNY",
      ].join("\n"),
    );
    expect(invalid.positions).toEqual([]);
    expect(invalid.errors[0]).toContain("Line 2");
  });

  test("creates an auto-starting deep-research chat for a portfolio workflow", () => {
    const request = { kind: "review" as const, portfolio, locale: "zh-CN" };
    const prompt = buildPortfolioWorkflowPrompt(request);
    const displayLabel = buildPortfolioWorkflowDisplayLabel(request);
    const url = new URL(
      createPortfolioWorkflowChatHref(request),
      "https://deerflow.local",
    );

    expect(prompt).toContain("今日复盘");
    expect(prompt).toContain(portfolio.id);
    expect(prompt).toContain("系统记忆中的投资者风险画像");
    expect(url.pathname).toBe("/workspace/chats/new");
    expect(url.searchParams.get("autostart")).toBe("1");
    expect(url.searchParams.get("mode")).toBe("pro");
    expect(url.searchParams.get("portfolioId")).toBe(portfolio.id);
    expect(url.searchParams.get("portfolioName")).toBe(portfolio.name);
    expect(url.searchParams.get("workflowKind")).toBe("review");
    expect(url.searchParams.get("prompt")).toBeNull();
    expect(displayLabel).toBe("今日复盘 · 长期成长组合");
  });

  test("keeps execution prompts private while deriving a compact workflow label", () => {
    const prompt = buildPortfolioWorkflowPrompt({
      kind: "strategy",
      portfolio,
      locale: "zh-CN",
    });
    const additionalKwargs = {
      investment_workspace: {
        workflow_kind: "strategy",
        portfolio_id: portfolio.id,
        portfolio_name: portfolio.name,
        display_label: "策略优化 · 长期成长组合",
      },
    };

    const display = readPortfolioWorkflowDisplay(prompt, additionalKwargs);
    expect(display?.label).toBe("策略优化 · 长期成长组合");
    expect(display?.label).not.toContain("聚焦能力发现");
    expect(
      portfolioWorkflowThreadDisplayTitle(
        "请在深研模式下对组合「长期成长组合」优化当前策略...",
        [
          {
            type: "human",
            content: prompt,
            additional_kwargs: additionalKwargs,
          },
        ],
      ),
    ).toBe("策略优化 · 长期成长组合");
  });

  test("cleans legacy workflow messages that predate display metadata", () => {
    const prompt = buildPortfolioWorkflowPrompt({
      kind: "risk",
      portfolio,
      locale: "zh-CN",
    });
    const display = readPortfolioWorkflowDisplay(prompt, {
      investment_workspace: {
        workflow_kind: "risk",
        portfolio_id: portfolio.id,
      },
    });

    expect(display?.label).toBe("风险分析 · 长期成长组合");
  });
});
