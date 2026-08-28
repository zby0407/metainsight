import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function rewrite(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const before = await readFile(filePath, "utf8");
  const after = transform(before);
  if (after === before) {
    throw new Error(`Branding transform made no changes: ${relativePath}`);
  }
  await writeFile(filePath, after);
}

function replaceRequired(source, search, replacement, relativePath) {
  if (!source.includes(search)) {
    throw new Error(`Expected branding source was not found in ${relativePath}`);
  }
  return source.replace(search, replacement);
}

function replaceRequiredPattern(source, pattern, replacement, relativePath) {
  if (!pattern.test(source)) {
    throw new Error(`Expected branding block was not found in ${relativePath}`);
  }
  return source.replace(pattern, replacement);
}

const layoutPath = "src/app/layout.tsx";
await rewrite(layoutPath, (source) => {
  let next = replaceRequired(
    source,
    '  title: "DeerFlow",\n  description: "A LangChain-based framework for building super agents.",',
    '  title: "知衡｜看懂中国资产",\n  description: "面向中国资产市场的智能研究与分析工作台。",\n  icons: { icon: "/images/zhiheng-mark.svg" },',
    layoutPath,
  );
  return next;
});

const workspaceHeaderPath =
  "src/components/workspace/workspace-header.tsx";
await rewrite(workspaceHeaderPath, (source) => {
  let next = source.replaceAll("DeerFlow", "知衡");
  next = replaceRequired(next, "              DF\n", "              知\n", workspaceHeaderPath);
  return next;
});

const workspaceContainerPath =
  "src/components/workspace/workspace-container.tsx";
await rewrite(workspaceContainerPath, (source) => {
  let next = replaceRequired(
    source,
    '\nimport { GithubIcon } from "./github-icon";',
    "",
    workspaceContainerPath,
  );
  next = replaceRequired(
    next,
    '\nimport { Tooltip } from "./tooltip";',
    "",
    workspaceContainerPath,
  );
  next = replaceRequiredPattern(
    next,
    /\n      <div className="pr-4">[\s\S]*?\n      <\/div>\n    <\/header>/,
    "\n    </header>",
    workspaceContainerPath,
  );
  return next;
});

const localePaths = [
  "src/core/i18n/locales/zh-CN.ts",
  "src/core/i18n/locales/en-US.ts",
];

for (const localePath of localePaths) {
  await rewrite(localePath, (source) => {
    let next = source.replaceAll("DeerFlow", "知衡");
    next = next.replace(
      "欢迎使用 🦌 知衡，一个完全开源的超级智能体。",
      "欢迎使用知衡助手。",
    );
    next = next.replace(
      "Welcome to 🦌 知衡, an open source super agent.",
      "Welcome to 知衡, a professional AI research assistant.",
    );
    return next;
  });
}

for (const relativePath of [
  "src/components/market/market-workspace.tsx",
  "src/components/market/watchlist-workspace.tsx",
  "src/core/agents/api.ts",
]) {
  await rewrite(relativePath, (source) => source.replaceAll("DeerFlow", "知衡"));
}

const watchlistPath = "src/components/market/watchlist-workspace.tsx";
await rewrite(watchlistPath, (source) => {
  let next = replaceRequired(
    source,
    'import { cn } from "@/lib/utils";',
    'import { cn } from "@/lib/utils";\n\nimport { DsaAutoResearchPanel } from "./dsa-auto-research-panel";',
    watchlistPath,
  );
  next = replaceRequired(
    next,
    "              <SummaryCards rows={data.rows} />",
    `              <SummaryCards rows={data.rows} />\n\n              <DsaAutoResearchPanel\n                stocks={data.rows.map((row) => ({\n                  symbol: row.code,\n                  name: row.quote?.stock_name || row.research?.stock_name,\n                }))}\n              />`,
    watchlistPath,
  );
  return next;
});

const aboutContent = `/** Product-facing About content for the Zhiheng deployment. */
export const aboutMarkdown = \`# 关于知衡

**知衡**是一套面向中国资产市场的智能研究与分析工作台，帮助用户把行情、资讯、公司资料和深度研究放在同一个工作流中。

> 看懂中国资产

---

## 核心能力

- **市场研究**：围绕指数、板块和个股组织行情、资讯与研究结论。
- **智能分析**：通过可扩展的工具与技能完成检索、分析、计算和内容生成。
- **研究工作台**：在对话中跟踪任务过程、证据来源和交付产物。
- **长期记忆**：在获得授权的前提下保留偏好和上下文，提供连续体验。
- **安全执行**：在隔离环境中处理文件、运行代码并生成研究产物。

---

知衡提供研究辅助，不构成任何投资建议。市场有风险，决策需谨慎。
\`;
`;

await writeFile(
  path.join(root, "src/components/workspace/settings/about-content.ts"),
  aboutContent,
);

await writeFile(
  path.join(root, "src/components/workspace/settings/about.md"),
  `# 关于知衡

**知衡**是一套面向中国资产市场的智能研究与分析工作台。

## 核心能力

- 市场研究与证据整理
- 智能检索、分析和内容生成
- 对话式研究工作台
- 长期记忆与安全执行

知衡提供研究辅助，不构成任何投资建议。市场有风险，决策需谨慎。
`,
);

await writeFile(
  path.join(root, "src/app/page.tsx"),
  `import { redirect } from "next/navigation";

export default function LandingPage() {
  redirect("/workspace");
}
`,
);

const visibleSurfaceFiles = [
  layoutPath,
  workspaceHeaderPath,
  workspaceContainerPath,
  "src/components/workspace/workspace-nav-menu.tsx",
  "src/components/workspace/settings/about-content.ts",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/setup/page.tsx",
  "src/components/market/market-workspace.tsx",
  "src/components/market/watchlist-workspace.tsx",
  ...localePaths,
];

const forbiddenPatterns = [
  /DeerFlow/i,
  /deerflow\.tech/i,
  /github\.com\/bytedance/i,
  /完全开源/,
  /open source super agent/i,
  /images\/deer\.svg/i,
];

for (const relativePath of visibleSurfaceFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      throw new Error(
        `Forbidden upstream branding remains in ${relativePath}: ${pattern}`,
      );
    }
  }
}

console.log("Applied Zhiheng product branding.");
