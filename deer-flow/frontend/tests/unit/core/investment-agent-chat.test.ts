import { expect, test } from "@rstest/core";

import {
  createInvestmentAgentChatHref,
  normalizeAgentChatPrompt,
} from "@/core/agents/investment-chat";

test("normalizes agent chat prompts while preserving useful line breaks", () => {
  expect(normalizeAgentChatPrompt("  first\r\nsecond\0  ")).toBe(
    "first\nsecond",
  );
  expect(normalizeAgentChatPrompt(null)).toBe("");
  expect(normalizeAgentChatPrompt("abcdef", 4)).toBe("abcd");
});

test("creates a MetaInsight chat URL without encoding execution logic", () => {
  const href = createInvestmentAgentChatHref("读取组合，再开始复盘");
  const url = new URL(href, "https://deepmem.local");

  expect(url.pathname).toBe("/workspace/chats/new");
  expect(url.searchParams.get("source")).toBe("investment-agent");
  expect(url.searchParams.get("prompt")).toBe("读取组合，再开始复盘");
});
