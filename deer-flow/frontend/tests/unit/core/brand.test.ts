import { expect, test } from "@rstest/core";

import { BRAND_DESCRIPTION, BRAND_NAME } from "@/core/brand";

test("exposes the MetaInsight white-label identity", () => {
  expect(BRAND_NAME).toBe("MetaInsight");
  expect(BRAND_DESCRIPTION).toContain("洞察");
  expect(`${BRAND_NAME} ${BRAND_DESCRIPTION}`).not.toMatch(/deerflow/i);
});
