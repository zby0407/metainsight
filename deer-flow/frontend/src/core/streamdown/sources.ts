const SOURCES_HEADING_LABELS = new Set([
  "source",
  "sources",
  "reference",
  "references",
  "参考来源",
  "引用来源",
  "信息来源",
  "资料来源",
  "来源",
]);

export function isSourcesHeadingText(value: string) {
  const normalized = value
    .replace(/[：:]$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return SOURCES_HEADING_LABELS.has(normalized);
}
