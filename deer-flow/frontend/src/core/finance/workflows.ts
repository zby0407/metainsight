export type PortfolioWorkflowKind = "review" | "risk" | "strategy" | "sandbox";

export interface PortfolioWorkflowRequest {
  kind: PortfolioWorkflowKind;
  portfolio: {
    id: string;
    name: string;
  };
  locale: string;
  investorPreference?: string;
}

export interface PortfolioWorkflowDisplay {
  kind: PortfolioWorkflowKind;
  portfolioId: string;
  portfolioName: string;
  label: string;
}

type WorkflowMessageLike = {
  type?: string;
  content?: unknown;
  additional_kwargs?: Record<string, unknown> | null;
};

const WORKFLOW_KINDS = new Set<PortfolioWorkflowKind>([
  "review",
  "risk",
  "strategy",
  "sandbox",
]);

const WORKFLOW_PROMPTS: Record<
  PortfolioWorkflowKind,
  { zh: string; en: string }
> = {
  review: {
    zh: "执行今日复盘：读取已有数据后直接完成，并给出结论、变化、证据缺口和下一步。改仓建议必须对照系统记忆中的投资者风险画像。",
    en: "Run today's review from the saved data and return conclusions, changes, evidence gaps, and next steps. Any rebalance suggestion must honor the investor risk profile in system memory.",
  },
  risk: {
    zh: "执行风险检查：直接给出当前暴露、约束、异常和优先处理建议。检查现金底仓与单一持仓是否突破系统记忆中的个人画像。",
    en: "Run a risk check and return current exposures, constraints, anomalies, and prioritized actions. Check cash floor and single-name concentration against the investor profile in system memory.",
  },
  strategy: {
    zh: "优化当前策略：基于已有组合证据提出改进，并自动完成安全、可逆的本地记录。任何改仓不得突破系统记忆中的现金底仓与单一持仓上限，并在改仓依据中引用该画像。",
    en: "Improve the current strategy from saved portfolio evidence and complete safe, reversible local records automatically. Do not breach the cash floor or single-stock cap in system memory, and cite that profile in the change basis.",
  },
  sandbox: {
    zh: "创建隔离模拟沙盘：从当前组合建立一个有判别力的实验分支，并给出观察指标。沙盘仓位同样受系统记忆中投资者风险画像约束。",
    en: "Create an isolated simulation sandbox with one discriminating branch and its observation metrics. Sandbox weights must still honor the investor risk profile in system memory.",
  },
};

const WORKFLOW_LABELS: Record<
  PortfolioWorkflowKind,
  { zh: string; en: string }
> = {
  review: { zh: "今日复盘", en: "Today's review" },
  risk: { zh: "风险分析", en: "Risk analysis" },
  strategy: { zh: "策略优化", en: "Strategy update" },
    sandbox: { zh: "沙盘推演", en: "Simulation sandbox" },
};

function workflowLanguage(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function normalizeDisplayText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isWorkflowKind(value: unknown): value is PortfolioWorkflowKind {
  return (
    typeof value === "string" &&
    WORKFLOW_KINDS.has(value as PortfolioWorkflowKind)
  );
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const text = Reflect.get(part, "text");
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

function extractLegacyPortfolioName(content: string) {
  const chineseMatch = /组合[「“\"]([^」”\"]{1,80})[」”\"]/.exec(content);
  if (chineseMatch?.[1]) return normalizeDisplayText(chineseMatch[1], 80);

  const englishMatch = /portfolio\s+[“\"]([^”\"]{1,80})[”\"]/i.exec(content);
  return englishMatch?.[1] ? normalizeDisplayText(englishMatch[1], 80) : "";
}

export function buildPortfolioWorkflowDisplayLabel(
  request: PortfolioWorkflowRequest,
) {
  const language = workflowLanguage(request.locale);
  const action = WORKFLOW_LABELS[request.kind][language];
  return `${action} · ${request.portfolio.name}`;
}

export function buildPortfolioWorkflowPrompt(
  request: PortfolioWorkflowRequest,
) {
  const language = workflowLanguage(request.locale);
  const instruction = WORKFLOW_PROMPTS[request.kind][language];
  const preference = request.investorPreference?.trim();
  const memoryRule =
    language === "zh"
      ? "改仓、加减仓或策略调整时必须参考系统记忆中的投资者风险画像，不得突破其现金底仓与单一持仓上限。"
      : "When rebalancing or changing position sizes, consult the investor risk profile in system memory and do not breach its cash floor or single-stock cap.";
  const base =
    language === "zh"
      ? `请在深研模式下对组合「${request.portfolio.name}」（ID: ${request.portfolio.id}）${instruction}${memoryRule}按本次意图只做一次聚焦能力发现并复用准确能力，不要猜工具名，也不要让我重复提供已有数据。`
      : `In deep-research mode, use portfolio “${request.portfolio.name}” (ID: ${request.portfolio.id}). ${instruction} ${memoryRule} Discover the focused capabilities once and reuse the exact results; do not guess tool names or ask me for saved data again.`;
  if (!preference) return base;
  return language === "zh"
    ? `${base}投资者偏好：${preference}`
    : `${base} Investor preference: ${preference}`;
}

export function createPortfolioWorkflowChatHref(
  request: PortfolioWorkflowRequest,
) {
  const searchParams = new URLSearchParams({
    source: "investment-agent",
    autostart: "1",
    mode: "pro",
    portfolioId: request.portfolio.id,
    portfolioName: request.portfolio.name,
    workflowKind: request.kind,
    locale: request.locale,
  });

  return `/workspace/chats/new?${searchParams.toString()}`;
}

export function readPortfolioWorkflowDisplay(
  content: unknown,
  additionalKwargs: Record<string, unknown> | null | undefined,
): PortfolioWorkflowDisplay | null {
  const workspace = additionalKwargs?.investment_workspace;
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    return null;
  }

  const kind = Reflect.get(workspace, "workflow_kind");
  const portfolioId = normalizeDisplayText(
    Reflect.get(workspace, "portfolio_id"),
    64,
  );
  if (!isWorkflowKind(kind) || !portfolioId) return null;

  const rawContent = textFromMessageContent(content);
  const portfolioName =
    normalizeDisplayText(Reflect.get(workspace, "portfolio_name"), 80) ||
    extractLegacyPortfolioName(rawContent);
  const explicitLabel = normalizeDisplayText(
    Reflect.get(workspace, "display_label"),
    120,
  );
  const locale = /[\u3400-\u9fff]/.test(rawContent) ? "zh-CN" : "en-US";
  const label =
    explicitLabel ||
    (portfolioName
      ? buildPortfolioWorkflowDisplayLabel({
          kind,
          portfolio: { id: portfolioId, name: portfolioName },
          locale,
        })
      : WORKFLOW_LABELS[kind][workflowLanguage(locale)]);

  return { kind, portfolioId, portfolioName, label };
}

export function portfolioWorkflowTitleFromMessages(
  messages: WorkflowMessageLike[] | null | undefined,
) {
  for (const message of messages ?? []) {
    if (message.type !== "human") continue;
    const display = readPortfolioWorkflowDisplay(
      message.content,
      message.additional_kwargs,
    );
    if (display) return display.label;
  }
  return null;
}

export function portfolioWorkflowThreadDisplayTitle(
  currentTitle: string | null | undefined,
  messages: WorkflowMessageLike[] | null | undefined,
) {
  const workflowTitle = portfolioWorkflowTitleFromMessages(messages);
  if (!workflowTitle) return currentTitle ?? null;

  const normalizedTitle = currentTitle?.trim() ?? "";
  const isLegacyPromptTitle =
    normalizedTitle.includes("请在深研模式下对组合") ||
    normalizedTitle.includes("在深研模式处理组合") ||
    normalizedTitle.toLowerCase().includes("in deep-research mode");
  if (
    !normalizedTitle ||
    normalizedTitle === "Untitled" ||
    isLegacyPromptTitle
  ) {
    return workflowTitle;
  }
  return currentTitle ?? workflowTitle;
}
