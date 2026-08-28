import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

const MOCK_AGENTS = [
  {
    name: "test-agent",
    description: "A test agent for E2E tests",
    system_prompt: "You are a test agent.",
  },
];

test.describe("Agent chat", () => {
  test("agent gallery page loads and shows agents", async ({ page }) => {
    mockLangGraphAPI(page, { agents: MOCK_AGENTS });

    await page.goto("/workspace/agents");

    // The agent card should appear with the agent name
    await expect(page.getByText("test-agent")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("investment workspace shows returns and starts a streaming Agent chat", async ({
    page,
  }) => {
    const portfolioId = "51eea9b8-f3c2-4e48-a28c-7b51c01792bf";
    let chatPayload: unknown;
    mockLangGraphAPI(page, {
      agents: MOCK_AGENTS,
      onChatRun: (payload) => {
        chatPayload = payload;
      },
      portfolioDashboard: {
        summary: {
          portfolioCount: 1,
          activeCount: 1,
          withStrategyCount: 1,
          withSnapshotCount: 1,
        },
        portfolios: [
          {
            portfolio: {
              id: portfolioId,
              name: "长期成长组合",
              purpose: "退休资金",
              baseCurrency: "CNY",
              benchmark: "000300.SH",
              status: "active",
              revision: 3,
              createdAt: "2026-07-01T00:00:00Z",
              updatedAt: "2026-07-15T00:00:00Z",
              archivedAt: null,
            },
            strategyCount: 1,
            activeStrategy: {
              id: "00000000-0000-0000-0000-000000000010",
              portfolioId,
              version: 2,
              status: "active",
              objective: "长期稳健增长",
              horizon: "10 years",
              benchmark: "000300.SH",
              policy: {},
              createdFromId: null,
              approvedAt: "2026-07-02T00:00:00Z",
              effectiveFrom: "2026-07-02T00:00:00Z",
              retiredAt: null,
              createdAt: "2026-07-02T00:00:00Z",
              updatedAt: "2026-07-02T00:00:00Z",
            },
            positions: [
              {
                id: "00000000-0000-0000-0000-000000000020",
                portfolioId,
                market: "SH",
                symbol: "600519",
                name: "贵州茅台",
                quantity: "10",
                averageCost: "1420.00",
                currency: "CNY",
                source: "manual",
                asOf: "2026-07-15T08:00:00Z",
              },
            ],
            cashBalances: [],
            latestSnapshot: {
              id: "00000000-0000-0000-0000-000000000030",
              portfolioId,
              strategyVersionId: "00000000-0000-0000-0000-000000000010",
              sessionDate: "2026-07-15",
              dataRevision: 1,
              portfolioRevision: 3,
              status: "final",
              baseCurrency: "CNY",
              holdingsValue: "100000.00",
              cashValue: "23456.78",
              totalEquity: "123456.78",
              inputHash: "input",
              marketDataHash: "market",
              snapshotHash: "snapshot",
              formulaVersion: "v1",
              payload: {},
              dataGaps: [],
              dataCutoff: "2026-07-15T08:00:00Z",
              createdAt: "2026-07-15T08:00:00Z",
            },
            latestReview: null,
            performance: {
              status: "complete",
              periodStart: "2026-07-01",
              periodEnd: "2026-07-15",
              snapshotCount: 10,
              returnIntervalCount: 9,
              dailyReturn: "0.0125",
              dailyPnl: "1523.45",
              cumulativeReturn: "0.125",
              maxDrawdown: "-0.08",
              annualizedVolatility: "0.18",
              unrealizedPnl: "16500.00",
              unrealizedReturn: "0.15",
              cashWeight: "0.19",
              dataGaps: [],
            },
          },
        ],
      },
    });

    await page.goto("/workspace/agents");

    await expect(
      page.getByRole("heading", {
        name: /Your investment portfolio workspace|你的投资组合工作台/,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "长期成长组合", exact: true }),
    ).toBeVisible();
    const performance = page.getByTestId("portfolio-performance");
    await expect(performance.getByText(/123,456\.78/)).toBeVisible();
    await expect(performance.getByText("+12.50%")).toBeVisible();
    await expect(performance.getByText("+1.25%")).toBeVisible();
    await expect(
      page.getByTestId("portfolio-workspace").getByText("-8.00%"),
    ).toBeVisible();
    await expect(page.getByText("600519")).not.toBeVisible();
    await page.getByRole("tab", { name: /Holdings|持仓账户/ }).click();
    await expect(page.getByText("600519")).toBeVisible();

    await page.getByRole("tab", { name: /Overview|组合概览/ }).click();
    await page.getByRole("button", { name: /Today's review|今日复盘/ }).click();

    await expect(page).toHaveURL(
      /\/workspace\/chats\/00000000-0000-0000-0000-000000000001$/,
    );
    await expect(page.getByText("Hello from DeerFlow!")).toBeVisible();
    await expect.poll(() => chatPayload).not.toBeUndefined();
    const serializedPayload = JSON.stringify(chatPayload);
    expect(serializedPayload).toContain(portfolioId);
    expect(serializedPayload).toContain("investment_workspace");
    expect(serializedPayload).toContain("display_label");
    expect(serializedPayload).toContain("今日复盘 · 长期成长组合");
    expect(serializedPayload).toContain("今日复盘");
    expect(serializedPayload).toContain('"mode":"pro"');
  });

  test("creates a first portfolio without leaving the workspace", async ({
    page,
  }) => {
    const setupRequests: unknown[] = [];
    const portfolioId = "51eea9b8-f3c2-4e48-a28c-7b51c01792bf";
    const createdPortfolio = {
      id: portfolioId,
      name: "退休成长组合",
      purpose: "退休资金长期增值",
      baseCurrency: "CNY",
      benchmark: null,
      status: "active",
      revision: 2,
      createdAt: "2026-07-16T00:00:00Z",
      updatedAt: "2026-07-16T00:00:00Z",
      archivedAt: null,
    };
    mockLangGraphAPI(page, {
      agents: MOCK_AGENTS,
      onPortfolioSetup: (payload) => setupRequests.push(payload),
      portfolioDashboardAfterSetup: {
        summary: {
          portfolioCount: 1,
          activeCount: 1,
          withStrategyCount: 1,
          withSnapshotCount: 0,
        },
        portfolios: [
          {
            portfolio: createdPortfolio,
            strategyCount: 1,
            activeStrategy: {
              id: "00000000-0000-0000-0000-000000000010",
              portfolioId,
              version: 1,
              status: "active",
              objective: "长期稳健增值",
              horizon: "5 年以上",
              benchmark: null,
              policy: {},
              createdFromId: null,
              approvedAt: "2026-07-16T00:00:00Z",
              effectiveFrom: "2026-07-16T00:00:00Z",
              retiredAt: null,
              createdAt: "2026-07-16T00:00:00Z",
              updatedAt: "2026-07-16T00:00:00Z",
            },
            positions: [],
            cashBalances: [
              {
                id: "00000000-0000-0000-0000-000000000020",
                portfolioId,
                currency: "CNY",
                amount: "100000",
                source: "investment_workspace",
                asOf: "2026-07-16T00:00:00Z",
              },
            ],
            latestSnapshot: null,
            latestReview: null,
            performance: {
              status: "insufficient_data",
              periodStart: null,
              periodEnd: null,
              snapshotCount: 0,
              returnIntervalCount: 0,
              dailyReturn: null,
              dailyPnl: null,
              cumulativeReturn: null,
              maxDrawdown: null,
              annualizedVolatility: null,
              unrealizedPnl: null,
              unrealizedReturn: null,
              cashWeight: null,
              dataGaps: [],
            },
          },
        ],
      },
      portfolioSetupResponse: {
        idempotentReplay: false,
        portfolio: createdPortfolio,
        account: {
          portfolioId,
          portfolioRevision: 2,
          baseCurrency: "CNY",
          positions: [],
          cashBalances: [],
        },
        strategy: null,
        snapshot: null,
        snapshotError: null,
      },
    });

    await page.goto("/workspace/agents");
    await expect(
      page.getByRole("heading", { name: /No portfolios yet|还没有投资组合/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("portfolio-create-empty").click();
    await expect(
      page.getByRole("heading", {
        name: /Create investment portfolio|新建投资组合/,
      }),
    ).toBeVisible();

    await page.getByLabel(/Portfolio name|组合名称/).fill("退休成长组合");
    await page.getByLabel(/Purpose|组合用途/).fill("退休资金长期增值");
    await page.getByRole("button", { name: /Continue|下一步/ }).click();
    await page.getByLabel(/Cash amount|现金金额/).fill("100000");
    await page.getByRole("button", { name: /Continue|下一步/ }).click();
    await page.getByLabel(/Strategy objective|策略目标/).fill("长期稳健增值");
    await page.getByLabel(/Investment horizon|投资期限/).fill("5 年以上");
    await page
      .getByRole("button", {
        name: /Create portfolio and open overview|建立组合并进入总览/,
      })
      .click();

    await expect(page).toHaveURL(/\/workspace\/agents$/);
    await expect(
      page.getByRole("heading", { name: "退休成长组合", exact: true }),
    ).toBeVisible();
    expect(setupRequests).toHaveLength(1);
    expect(JSON.stringify(setupRequests[0])).toContain("investment_workspace");
    expect(JSON.stringify(setupRequests[0])).toContain("100000");
    expect(JSON.stringify(setupRequests[0])).toContain("长期稳健增值");
  });

  test("agent chat page loads with input box", async ({ page }) => {
    mockLangGraphAPI(page, { agents: MOCK_AGENTS });

    await page.goto("/workspace/agents/test-agent/chats/new");

    // The prompt input textarea should be visible
    const textarea = page.getByPlaceholder(/how can i assist you/i);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
  });

  test("agent chat page shows agent badge", async ({ page }) => {
    mockLangGraphAPI(page, { agents: MOCK_AGENTS });

    await page.goto("/workspace/agents/test-agent/chats/new");

    // The agent badge should display in the header (scoped to header to avoid
    // matching the welcome area which also shows the agent name)
    await expect(
      page.locator("header span", { hasText: "test-agent" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
