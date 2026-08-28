import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

test.describe("Landing page", () => {
  test("renders the header and hero section", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("header").getByText("MetaInsight")).toBeVisible();
    await expect(page).toHaveTitle("MetaInsight");

    await expect(
      page.getByRole("link", { name: /进入工作台/i }).first(),
    ).toBeVisible();
  });

  test("Get Started link navigates to workspace", async ({ page }) => {
    mockLangGraphAPI(page);

    await page.goto("/");

    const getStarted = page
      .getByRole("link", { name: /进入工作台/i })
      .first();
    await getStarted.click();

    await page.waitForURL("**/workspace/chats/new");
    await expect(page).toHaveURL(/\/workspace\/chats\/new/);
  });
});
