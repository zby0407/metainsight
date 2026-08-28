import { expect, test } from "@rstest/core";
import rehypeRaw from "rehype-raw";

import { reasoningPlugins, streamdownPlugins } from "@/core/streamdown/plugins";
import { isSourcesHeadingText } from "@/core/streamdown/sources";

test("streamdownPlugins includes rehypeRaw", () => {
  expect(streamdownPlugins.rehypePlugins).toContain(rehypeRaw);
});

test("reasoningPlugins does not include rehypeRaw", () => {
  const flat = reasoningPlugins.rehypePlugins?.flat();
  expect(flat).not.toContain(rehypeRaw);
});

test("isSourcesHeadingText recognizes standalone source headings", () => {
  expect(isSourcesHeadingText("Sources")).toBe(true);
  expect(isSourcesHeadingText("References:")).toBe(true);
  expect(isSourcesHeadingText("引用来源")).toBe(true);
  expect(isSourcesHeadingText("资料来源：")).toBe(true);
});

test("isSourcesHeadingText does not match prose headings", () => {
  expect(isSourcesHeadingText("Source quality")).toBe(false);
  expect(isSourcesHeadingText("关键来源分析")).toBe(false);
});
