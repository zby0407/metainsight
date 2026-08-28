import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localePaths = [
  "src/core/i18n/locales/zh-CN.ts",
  "src/core/i18n/locales/en-US.ts",
];

for (const relativePath of localePaths) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const branded = source
    .replace(/DeerFlow/gi, "知衡")
    .replace(
      "欢迎使用 🦌 知衡，一个完全开源的超级智能体。",
      "欢迎使用知衡助手。",
    )
    .replace(
      "Welcome to 🦌 知衡, an open source super agent.",
      "Welcome to 知衡, a professional AI research assistant.",
    );

  if (branded === source) {
    throw new Error(
      `Investment Agent branding made no changes: ${relativePath}`,
    );
  }
  await writeFile(filePath, branded);
}

console.log("Applied Investment Agent overlay branding.");
