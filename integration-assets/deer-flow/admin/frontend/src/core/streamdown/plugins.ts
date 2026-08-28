import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { StreamdownProps } from "streamdown";

import { rehypeSplitWordsIntoSpans } from "../rehype";

// Financial text frequently uses a single tilde to mean "approximately",
// for example `市值~8796亿，股价~1373元`. GFM's default single-tilde
// extension interprets the text between those two tildes as strikethrough.
// Requiring the standard double tilde keeps approximate values readable while
// preserving intentional `~~strikethrough~~` markup.
const remarkGfmFinancial = [remarkGfm, { singleTilde: false }];

export const streamdownPlugins = {
  remarkPlugins: [
    remarkGfmFinancial,
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [
    rehypeRaw,
    [rehypeKatex, { output: "html" }],
  ] as StreamdownProps["rehypePlugins"],
};

export const streamdownPluginsWithWordAnimation = {
  remarkPlugins: [
    remarkGfmFinancial,
    [remarkMath, { singleDollarTextMath: true }],
  ] as StreamdownProps["remarkPlugins"],
  rehypePlugins: [
    [rehypeKatex, { output: "html" }],
    rehypeSplitWordsIntoSpans,
  ] as StreamdownProps["rehypePlugins"],
};

// Reasoning/thinking content excludes rehypeRaw so model-generated HTML is not
// interpreted as DOM elements.
export const reasoningPlugins = {
  remarkPlugins: streamdownPlugins.remarkPlugins,
  rehypePlugins: streamdownPlugins.rehypePlugins?.filter(
    (plugin) => plugin !== rehypeRaw,
  ) as StreamdownProps["rehypePlugins"],
};
