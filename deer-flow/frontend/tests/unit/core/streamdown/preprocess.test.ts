import { expect, test } from "@rstest/core";

import {
  capBlockquoteNesting,
  capListNesting,
  capMarkdownNesting,
  preprocessStreamdownMarkdown,
  repairCollapsedMarkdown,
} from "@/core/streamdown/preprocess";

test("capBlockquoteNesting returns normal content unchanged", () => {
  const input = "# Title\n\n> a quote\n>> nested\n\nsome `code`";
  expect(capBlockquoteNesting(input)).toBe(input);
});

test("capBlockquoteNesting keeps nesting at or below the cap untouched", () => {
  const input = "> ".repeat(100) + "hi";
  expect(capBlockquoteNesting(input)).toBe(input);
});

test("capBlockquoteNesting caps pathological nesting and preserves content", () => {
  const result = capBlockquoteNesting("> ".repeat(5000) + "hi");
  expect((result.match(/>/g) ?? []).length).toBe(100);
  expect(result.endsWith("hi")).toBe(true);
});

test("capBlockquoteNesting handles markers without spaces", () => {
  const result = capBlockquoteNesting(">".repeat(5000) + "hi");
  expect((result.match(/>/g) ?? []).length).toBe(100);
  expect(result.endsWith("hi")).toBe(true);
});

test("capBlockquoteNesting leaves fenced code content untouched", () => {
  const literal = ">".repeat(150);
  const input = `${"> ".repeat(3000)}hi\n\`\`\`text\n${literal}\n\`\`\``;
  const result = capBlockquoteNesting(input);
  expect(result.split("\n")[2]).toBe(literal);
});

test("capBlockquoteNesting leaves indented code blocks untouched", () => {
  const literal = "    " + ">".repeat(150);
  const input = `${"> ".repeat(3000)}hi\n\n${literal}`;
  const result = capBlockquoteNesting(input);
  expect(result.split("\n")[2]).toBe(literal);
});

test("capBlockquoteNesting only rewrites pathological lines", () => {
  const normal = "> normal quote";
  const deep = "> ".repeat(3000) + "deep";
  const result = capBlockquoteNesting(`${normal}\n${deep}\nplain`);
  const lines = result.split("\n");
  expect(lines[0]).toBe(normal);
  expect((lines[1]?.match(/>/g) ?? []).length).toBe(100);
  expect(lines[2]).toBe("plain");
});

test("capListNesting returns normally indented content unchanged", () => {
  const input = "- a\n  - b\n    - c\n\n      code continuation";
  expect(capListNesting(input)).toBe(input);
});

test("capListNesting caps pathologically deep list indentation", () => {
  const deep = "  ".repeat(2000) + "- x";
  const result = capListNesting(deep);
  const indent = /^[ \t]*/.exec(result)![0];
  expect(indent.length).toBe(200);
  expect(result.endsWith("- x")).toBe(true);
});

test("capListNesting leaves fenced code content untouched", () => {
  const literal = " ".repeat(400) + "deeply indented ascii art";
  const input = `\`\`\`text\n${literal}\n\`\`\``;
  expect(capListNesting(input).split("\n")[1]).toBe(literal);
});

// Outside a fence, deep indentation is capped regardless of blank-line context:
// we cannot tell an indented-code line from deeply nested list content (both can
// follow a blank line), and exempting either reopens the crash — blank-separated
// deep-indent lists otherwise blow up marked just like contiguous ones.
test("capListNesting caps deep indentation even after a blank line", () => {
  const input = `- a\n\n${" ".repeat(500)}- deep`;
  const lines = capListNesting(input).split("\n");
  expect(/^[ \t]*/.exec(lines[2]!)![0].length).toBe(200);
});

test("capListNesting only rewrites pathological lines", () => {
  const normal = "    indented paragraph";
  const deep = " ".repeat(500) + "- deep";
  const result = capListNesting(`${normal}\n${deep}\nplain`);
  const lines = result.split("\n");
  expect(lines[0]).toBe(normal);
  expect(/^[ \t]*/.exec(lines[1]!)![0].length).toBe(200);
  expect(lines[2]).toBe("plain");
});

test("capMarkdownNesting caps both blockquote and list nesting", () => {
  const input = `${"> ".repeat(3000)}quote\n${" ".repeat(500)}- item`;
  const result = capMarkdownNesting(input);
  const lines = result.split("\n");
  expect((lines[0]?.match(/>/g) ?? []).length).toBe(100);
  expect(/^[ \t]*/.exec(lines[1]!)![0].length).toBe(200);
});

test("preprocessStreamdownMarkdown leaves non-mermaid content unchanged", () => {
  const input = "just some text";
  expect(preprocessStreamdownMarkdown(input)).toBe(input);
});

test("repairCollapsedMarkdown splits jammed headings and lists", () => {
  const input =
    "以上为结构指标。### 4.3 风险调整收益指标 Sharpe比率。## 五、实验判断标准 1. 哪条分支回撤最小 2. 哪条现金使用最有效。**立即执行**：配置沙盘。";
  const result = repairCollapsedMarkdown(input);
  expect(result).toContain("\n\n### 4.3 风险调整收益指标");
  expect(result).toContain("\n\n## 五、实验判断标准");
  expect(result).toContain("\n1. 哪条分支回撤最小");
  expect(result).toContain("\n2. 哪条现金使用最有效");
  expect(result).toContain("\n\n**立即执行**：");
});

test("repairCollapsedMarkdown is idempotent and keeps well-formed markdown", () => {
  const input = "# Title\n\n### 4.3 指标\n\n1. 第一条\n2. 第二条\n\n**强调**仍在句中。";
  expect(repairCollapsedMarkdown(input)).toBe(input);
  const jammed =
    "说明。### 4.3 风险 1. 回撤最小。**下一步**：继续。";
  expect(repairCollapsedMarkdown(repairCollapsedMarkdown(jammed))).toBe(
    repairCollapsedMarkdown(jammed),
  );
});

test("repairCollapsedMarkdown leaves fenced code untouched", () => {
  const input = "前文。```md\n### 4.3 still inside fence\n```后面。### 4.4 结构指标";
  const result = repairCollapsedMarkdown(input);
  expect(result).toContain("```md\n### 4.3 still inside fence\n```");
  expect(result).toContain("\n\n### 4.4 结构指标");
});

test("repairCollapsedMarkdown turns jammed metric dashes into list items", () => {
  const input = "判别力：中 -- Sortino比率 下行波动调整后收益";
  expect(repairCollapsedMarkdown(input)).toContain("\n- Sortino比率");
});
