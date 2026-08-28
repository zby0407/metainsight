import { normalizeMermaidMarkdown } from "./mermaid";

const MERMAID_BLOCK_HINT_RE = /mermaid/i;

// marked's blockquote tokenizer (used by Streamdown to split content into
// memoizable blocks) recurses once per nesting level and overflows the call
// stack at roughly 2,000 levels, replacing the whole chat route with an error
// page. 100 levels is far beyond any legitimate content while keeping a wide
// margin below the crash threshold.
const MAX_BLOCKQUOTE_DEPTH = 100;
const DEEP_BLOCKQUOTE_HINT_RE = new RegExp(
  `^(?:[ \\t]*>){${MAX_BLOCKQUOTE_DEPTH + 1}}`,
  "m",
);
// Only up to 3 leading spaces can start a blockquote; 4+ (or a tab) is an
// indented code block, where ">" runs are literal content.
const BLOCKQUOTE_PREFIX_RE = /^ {0,3}(?:[ \t]*>)+/;
const CODE_FENCE_RE = /^ {0,3}(?:```|~~~)/;
const INDENTED_CODE_RE = /^(?: {4}|\t)/;

// marked's list tokenizer recurses once per nesting level too (list ->
// blockTokens -> list -> ...). In the browser's tighter stack a deeply nested
// list overflows during render and throws "Maximum call stack size exceeded"
// from inside Streamdown's lexing useMemo (see issue #3393); on larger stacks
// the same input instead goes quadratic and exhausts the heap. Each list level
// requires at least ~2 columns of indentation, so capping leading whitespace at
// 200 columns bounds the effective nesting near 100 levels — far beyond any
// legitimate content while keeping marked safe. Anything indented past this is
// pathological nesting, not prose or code.
const MAX_LIST_INDENT = 200;
const DEEP_INDENT_HINT_RE = new RegExp(`^[ \\t]{${MAX_LIST_INDENT + 1},}`, "m");

export function capBlockquoteNesting(markdown: string): string {
  if (!DEEP_BLOCKQUOTE_HINT_RE.test(markdown)) {
    return markdown;
  }

  let insideFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (CODE_FENCE_RE.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      // ">" runs inside fenced or indented code blocks are literal text, not
      // nesting — rewriting them would silently corrupt code content.
      if (insideFence || INDENTED_CODE_RE.test(line)) {
        return line;
      }
      const match = BLOCKQUOTE_PREFIX_RE.exec(line);
      if (!match) {
        return line;
      }
      const prefix = match[0];
      let depth = 0;
      for (let i = 0; i < prefix.length; i++) {
        if (prefix[i] === ">") {
          depth += 1;
          if (depth > MAX_BLOCKQUOTE_DEPTH) {
            return line.slice(0, i) + line.slice(prefix.length);
          }
        }
      }
      return line;
    })
    .join("\n");
}

export function capListNesting(markdown: string): string {
  if (!DEEP_INDENT_HINT_RE.test(markdown)) {
    return markdown;
  }

  let insideFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (CODE_FENCE_RE.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      // Indentation inside fenced code is literal layout (ASCII art, pasted
      // source); collapsing it would corrupt the rendered block.
      if (insideFence) {
        return line;
      }
      const whitespace = /^[ \t]*/.exec(line)![0];
      if (whitespace.length <= MAX_LIST_INDENT) {
        return line;
      }
      return " ".repeat(MAX_LIST_INDENT) + line.slice(whitespace.length);
    })
    .join("\n");
}

// Cap every runaway nesting construct that can take down a message render
// before marked sees the content.
export function capMarkdownNesting(markdown: string): string {
  return capListNesting(capBlockquoteNesting(markdown));
}

const FENCE_MARK = "```";

function transformOutsideFences(
  input: string,
  transform: (chunk: string) => string,
): string {
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const start = input.indexOf(FENCE_MARK, cursor);
    if (start === -1) {
      result += transform(input.slice(cursor));
      break;
    }
    result += transform(input.slice(cursor, start));
    const end = input.indexOf(FENCE_MARK, start + FENCE_MARK.length);
    if (end === -1) {
      result += input.slice(start);
      break;
    }
    result += input.slice(start, end + FENCE_MARK.length);
    cursor = end + FENCE_MARK.length;
  }
  return result;
}

function unescapeLiteralNewlines(markdown: string): string {
  const realBreaks = (markdown.match(/\n/g) ?? []).length;
  if (realBreaks >= 3 || !/\\n(?:#{1,6}\s|[-*+]\s|\d+\.\s|\|)/.test(markdown)) {
    return markdown;
  }
  return markdown.replace(/\\n/g, "\n");
}

function breakJammedBlocks(chunk: string): string {
  let text = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Headings glued onto the previous sentence: "……说明。### 4.3 指标"
  text = text.replace(
    /(?<=[^\n#])[ \t]*(#{1,6}[ \t]+\S)/g,
    "\n\n$1",
  );

  // Numbered lists after punctuation or CJK: "。1. 哪条分支"
  text = text.replace(
    /(?<=[。！？；：、）】」』!.?:]|[\u3400-\u9fff])[ \t]+(\d{1,2}\.[ \t]+(?:[\u3400-\u9fff*✅❌]|\*\*))/gu,
    "\n$1",
  );

  // Bullets after punctuation: "。- 缺少基准"
  text = text.replace(
    /(?<=[。！？；：、）】」』!.?:]|[\u3400-\u9fff])[ \t]+([-*+][ \t]+(?:[\u3400-\u9fff*✅❌]|\*\*))/gu,
    "\n$1",
  );

  // Bold section labels: "。**立即执行**：方案 A"
  text = text.replace(
    /(?<=[。！？；：、）】」』!.?:])[ \t]*(\*\*[^*\n]{1,48}\*\*[：:]?)/gu,
    "\n\n$1",
  );

  // Metric rows jammed with " -- Name"： "判别力：中 -- Sortino比率"
  text = text.replace(
    /(?<=[^\n|\-\s])[ \t]+--[ \t]+(?=[\u3400-\u9fffA-Za-z])/gu,
    "\n- ",
  );

  // GFM table rows only when a separator row is present.
  if (/\|[ \t]*:?-{3,}:?[ \t]*\|/.test(text)) {
    text = text.replace(/(?<=[^\n|])[ \t]*(\|(?:[^|\n]+\|){1,})/g, "\n$1");
  }

  return text;
}

/**
 * Models sometimes emit Markdown headings/lists without line breaks, which
 * marked then treats as one paragraph (raw `###` / `1.` visible in chat).
 * Re-insert breaks outside fenced code so Streamdown can typeset the report.
 */
export function repairCollapsedMarkdown(markdown: string): string {
  if (!markdown) {
    return markdown;
  }
  const normalized = unescapeLiteralNewlines(markdown);
  return transformOutsideFences(normalized, breakJammedBlocks);
}

export function preprocessStreamdownMarkdown(markdown: string): string {
  const repaired = repairCollapsedMarkdown(markdown);
  if (!MERMAID_BLOCK_HINT_RE.test(repaired) || !repaired.includes("-.->")) {
    return repaired;
  }

  return normalizeMermaidMarkdown(repaired);
}
