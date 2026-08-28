import {
  CompassIcon,
  GraduationCapIcon,
  ImageIcon,
  MicroscopeIcon,
  PenLineIcon,
  ShapesIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";

import type { Translations } from "./types";

export const enUS: Translations = {
  // Locale meta
  locale: {
    localName: "English",
  },

  // Common
  common: {
    home: "Home",
    settings: "Settings",
    delete: "Delete",
    edit: "Edit",
    rename: "Rename",
    share: "Share",
    openInNewWindow: "Open in new window",
    close: "Close",
    more: "More",
    search: "Search",
    loadMore: "Load more",
    download: "Download",
    thinking: "Thinking",
    artifacts: "Artifacts",
    public: "Public",
    custom: "Custom",
    notAvailableInDemoMode: "Not available in demo mode",
    loading: "Loading...",
    version: "Version",
    lastUpdated: "Last updated",
    code: "Code",
    preview: "Preview",
    cancel: "Cancel",
    save: "Save",
    install: "Install",
    create: "Create",
    import: "Import",
    export: "Export",
    exportAsMarkdown: "Export as Markdown",
    exportAsJSON: "Export as JSON",
    exportSuccess: "Conversation exported",
  },

  // Home
  home: {
    docs: "Docs",
    blog: "Blog",
  },

  // Welcome
  welcome: {
    greeting: "Hello, again!",
    description:
      "Welcome to MetaInsight, your integrated research and decision workspace. With built-in and custom skills, MetaInsight helps you search the web, analyze data, preserve context, and generate useful artifacts.",

    createYourOwnSkill: "Create Your Own Skill",
    createYourOwnSkillDescription:
      "Create your own skill to extend MetaInsight. With customized skills, MetaInsight can support new research, analysis, and creation workflows.",
  },

  // Clipboard
  clipboard: {
    copyToClipboard: "Copy to clipboard",
    copiedToClipboard: "Copied to clipboard",
    failedToCopyToClipboard: "Failed to copy to clipboard",
    linkCopied: "Link copied to clipboard",
  },

  // Input Box
  inputBox: {
    placeholder: "How can I assist you today?",
    createSkillPrompt:
      "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
    addAttachments: "Add attachments",
    mode: "Mode",
    flashMode: "Flash",
    flashModeDescription: "Fast and efficient, but may not be accurate",
    reasoningMode: "Reasoning",
    reasoningModeDescription:
      "Reasoning before action, balance between time and accuracy",
    proMode: "Pro",
    proModeDescription:
      "Reasoning, planning and executing, get more accurate results, may take more time",
    ultraMode: "Ultra",
    ultraModeDescription:
      "Pro mode with subagents to divide work; best for complex multi-step tasks",
    reasoningEffort: "Reasoning Effort",
    reasoningEffortMinimal: "Minimal",
    reasoningEffortMinimalDescription: "Retrieval + Direct Output",
    reasoningEffortLow: "Low",
    reasoningEffortLowDescription: "Simple Logic Check + Shallow Deduction",
    reasoningEffortMedium: "Medium",
    reasoningEffortMediumDescription:
      "Multi-layer Logic Analysis + Basic Verification",
    reasoningEffortHigh: "High",
    reasoningEffortHighDescription:
      "Full-dimensional Logic Deduction + Multi-path Verification + Backward Check",
    searchModels: "Search models...",
    surpriseMe: "Surprise",
    surpriseMePrompt: "Surprise me",
    followupLoading: "Generating follow-up questions...",
    followupConfirmTitle: "Send suggestion?",
    followupConfirmDescription:
      "You already have text in the input. Choose how to send it.",
    followupConfirmAppend: "Append & send",
    followupConfirmReplace: "Replace & send",
    suggestions: [
      {
        suggestion: "Write",
        prompt: "Write a blog post about the latest trends on [topic]",
        icon: PenLineIcon,
      },
      {
        suggestion: "Research",
        prompt:
          "Conduct a deep dive research on [topic], and summarize the findings.",
        icon: MicroscopeIcon,
      },
      {
        suggestion: "Collect",
        prompt: "Collect data from [source] and create a report.",
        icon: ShapesIcon,
      },
      {
        suggestion: "Learn",
        prompt: "Learn about [topic] and create a tutorial.",
        icon: GraduationCapIcon,
      },
    ],
    suggestionsCreate: [
      {
        suggestion: "Webpage",
        prompt: "Create a webpage about [topic]",
        icon: CompassIcon,
      },
      {
        suggestion: "Image",
        prompt: "Create an image about [topic]",
        icon: ImageIcon,
      },
      {
        suggestion: "Video",
        prompt: "Create a video about [topic]",
        icon: VideoIcon,
      },
      {
        type: "separator",
      },
      {
        suggestion: "Skill",
        prompt:
          "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
        icon: SparklesIcon,
      },
    ],
  },

  // Sidebar
  sidebar: {
    newChat: "New chat",
    chats: "Chats",
    channels: "Channels",
    recentChats: "Conversation history",
    demoChats: "Demo chats",
    agents: "Portfolios",
  },

  // Agents
  agents: {
    title: "Agents",
    description:
      "Create and manage custom agents with specialized prompts and capabilities.",
    newAgent: "New Agent",
    emptyTitle: "No custom agents yet",
    emptyDescription:
      "Create your first custom agent with a specialized system prompt.",
    chat: "Chat",
    delete: "Delete",
    deleteConfirm:
      "Are you sure you want to delete this agent? This action cannot be undone.",
    deleteSuccess: "Agent deleted",
    newChat: "New chat",
    createPageTitle: "Design your Agent",
    createPageSubtitle:
      "Describe the agent you want — I'll help you create it through conversation.",
    nameStepTitle: "Name your new Agent",
    nameStepHint:
      "Letters, digits, and hyphens only — stored lowercase (e.g. code-reviewer)",
    nameStepPlaceholder: "e.g. code-reviewer",
    nameStepContinue: "Continue",
    nameStepInvalidError:
      "Invalid name — use only letters, digits, and hyphens",
    nameStepAlreadyExistsError: "An agent with this name already exists",
    nameStepNetworkError:
      "Network request failed — check your network or backend connection",
    nameStepCheckError: "Could not verify name availability — please try again",
    nameStepCheckErrorWithDetail: "Name check failed: {detail}",
    nameStepApiDisabledError:
      "Custom agent management is not enabled on this server. Please contact your administrator.",
    nameStepBootstrapMessage:
      "The new custom agent name is {name}. Help me design its purpose, behavior, and SOUL.md before saving it.",
    save: "Save agent",
    saving: "Saving agent...",
    saveRequested:
      "Save requested. MetaInsight is generating and saving an initial version now.",
    saveHint:
      "You can save this agent at any time from the top-right menu, even if this is only a first draft.",
    saveCommandMessage:
      "Please save this custom agent now based on everything we have discussed so far. Treat this as my explicit confirmation to save. If some details are still missing, make reasonable assumptions, generate a concise first SOUL.md in English, and call setup_agent immediately without asking me for more confirmation.",
    agentCreatedPendingRefresh:
      "The agent was created, but MetaInsight could not load it yet. Please refresh this page in a moment.",
    more: "More actions",
    agentCreated: "Agent created!",
    startChatting: "Start chatting",
    backToGallery: "Back to Gallery",
  },

  // Native investment agent capability center
  investmentAgent: {
    eyebrow: "Native investment workspace",
    title: "Your investment portfolio workspace",
    description:
      "Set up a portfolio, review holdings and returns, and continue into daily review, risk, strategy, or simulation from one page.",
    primaryAction: "Ask the Agent to review",
    secondaryAction: "View my portfolios",
    runtimeBadge: "Native Agent runtime",
    discoveryBadge: "Dynamic capability discovery",
    confirmationBadge: "Direct local actions",
    myPortfoliosTitle: "My portfolios",
    myPortfoliosDescription:
      "See accounts, strategies, snapshots, and review conclusions directly. Pick a portfolio to start without writing a prompt.",
    refreshPortfolios: "Refresh portfolios",
    portfolioTotal: "Total portfolios",
    portfolioActive: "Active",
    portfolioWithStrategy: "With strategy",
    portfolioWithSnapshot: "With snapshot",
    portfolioLoadError: "Portfolio data is temporarily unavailable",
    retry: "Retry",
    emptyPortfolioTitle: "No portfolios yet",
    emptyPortfolioDescription:
      "Create one here and inspect it directly, then continue into review, risk, strategy, or simulation when needed.",
    createPortfolioAction: "New portfolio",
    workspaceOverviewTab: "Overview",
    workspaceHoldingsTab: "Holdings",
    workspaceReviewTab: "Daily review",
    workspaceRiskTab: "Risk",
    workspaceStrategyTab: "Strategy",
    workspaceSandboxTab: "Sandbox",
    workspaceQuickActions: "What you can do next",
    workspaceSelectHint:
      "Select a portfolio to inspect it, then choose review, risk, strategy, or simulation on the right.",
    workspaceRunNow: "Start analysis",
    workspaceAgentReady: "Analysis continues in chat",
    workspaceAgentReadyDescription:
      "This opens a conversation with the current portfolio context. Results and progress continue there.",
    workspaceSnapshotBaseline: "Analysis baseline",
    setupDialogTitle: "Portfolio setup wizard",
    setupEyebrow: "Start here",
    setupTitle: "Create investment portfolio",
    setupDescription:
      "Enter only the essentials. Your draft stays in this browser, and completion opens the portfolio overview in place.",
    setupDraftSaved: "Draft saved automatically",
    setupStepOf: "Step {current} of {total}",
    setupPortfolioStep: "Portfolio",
    setupAccountStep: "Holdings and cash",
    setupStrategyStep: "Strategy goal",
    setupPortfolioName: "Portfolio name",
    setupPortfolioNamePlaceholder: "For example: Long-term growth",
    setupPurpose: "Purpose",
    setupPurposePlaceholder:
      "For example: retirement, education, or long-term growth",
    setupBaseCurrency: "Base currency",
    setupBenchmark: "Benchmark (optional)",
    setupBenchmarkPlaceholder: "For example: 000300.SH",
    setupPositions: "Current holdings",
    setupPositionsDescription: "Add rows manually or import a CSV file.",
    setupImportCsv: "Import CSV",
    setupCsvHint: "Headers: market,symbol,name,quantity,averageCost,currency",
    setupCsvImported: "Imported {count} positions",
    setupAddPosition: "Add a position",
    setupRemovePosition: "Remove position",
    setupMarket: "Market",
    setupSymbol: "Symbol",
    setupAssetName: "Name (optional)",
    setupQuantity: "Quantity",
    setupAverageCost: "Average cost",
    setupCurrency: "Currency",
    setupCash: "Cash balance",
    setupCashDescription:
      "You can also create a cash-only portfolio before adding holdings.",
    setupCashAmount: "Cash amount",
    setupObjective: "Strategy objective",
    setupObjectivePlaceholder:
      "For example: pursue steady long-term growth within an acceptable drawdown",
    setupHorizon: "Investment horizon",
    setupHorizonPlaceholder: "For example: 5+ years",
    setupReviewTitle: "Review and create",
    setupReviewPortfolio: "Portfolio",
    setupReviewAccount: "Account",
    setupReviewStrategy: "Strategy",
    setupBack: "Back",
    setupNext: "Continue",
    setupComplete: "Create portfolio and open overview",
    setupSaving: "Creating portfolio…",
    setupPortfolioRequired: "Enter a portfolio name to continue.",
    setupAccountRequired: "Add at least one valid position or a cash balance.",
    setupPositionInvalid:
      "Complete the market, symbol, quantity, cost, and currency for each position.",
    setupStrategyRequired: "Enter a strategy objective.",
    setupFailed: "Portfolio setup failed. Check the inputs and try again.",
    portfolioStatusActive: "Active",
    portfolioStatusArchived: "Archived",
    portfolioRevision: "Portfolio revision",
    portfolioBenchmark: "Benchmark",
    portfolioEquity: "Latest equity",
    portfolioPerformance: "Portfolio performance",
    portfolioCumulativeReturn: "Cumulative return",
    portfolioUnrealizedReturn: "Holdings return",
    portfolioDailyReturn: "Daily return",
    portfolioDailyPnl: "Daily P&L",
    portfolioUnrealizedPnl: "Unrealized P&L",
    portfolioMaxDrawdown: "Max drawdown",
    portfolioVolatility: "Annualized volatility",
    portfolioCashWeight: "Cash weight",
    portfolioPerformanceComplete: "Complete method",
    portfolioPerformancePartial: "Partial data",
    portfolioPerformanceInsufficient: "Insufficient history",
    portfolioPerformanceLive: "Live quotes",
    portfolioPerformanceWindow: "Measurement window",
    portfolioPerformanceSamples: "Snapshots / return intervals",
    portfolioPositions: "Positions",
    portfolioStrategy: "Active strategy",
    portfolioNoStrategy: "Not active yet",
    portfolioSnapshot: "Latest snapshot",
    portfolioNoSnapshot: "No snapshot yet",
    portfolioLatestReview: "Latest review",
    portfolioNoReview: "No review conclusion yet",
    workspaceOpeningBrief: "Opening baseline",
    workspaceStrategyChangeBasis: "Change basis",
    portfolioCash: "Cash balances",
    portfolioViewHoldings: "View holdings and cash",
    portfolioHideHoldings: "Hide holdings and cash",
    portfolioNoHoldings: "No holdings or cash accounts have been imported",
    portfolioQuantity: "Quantity",
    portfolioAverageCost: "Average cost",
    portfolioAsOf: "As of",
    portfolioReviewAction: "Today's review",
    portfolioRiskAction: "Risk check",
    portfolioStrategyAction: "Improve strategy",
    portfolioSandboxAction: "Run sandbox",
    portfolioArchivedHint: "Archived portfolio is view-only",
    workflowNativeBadge: "Agent deep-research workflow",
    workflowRunning: "Agent is working",
    workflowRunningDescription:
      "It is reading portfolio context and discovering the tools it needs. The result will appear here.",
    workflowResult: "Workflow result",
    workflowCompleted: "Completed",
    workflowFailed: "The workflow failed. Please try again shortly.",
    workflowRetry: "Run again",
    workflowAskWhy: "Ask a follow-up",
    workflowClose: "Close result",
    workflowReviewDescription:
      "Check strategy performance, changes, and data gaps from the latest snapshot.",
    workflowRiskDescription:
      "Check positions, cash, concentration, and strategy constraints.",
    workflowStrategyDescription:
      "Create a traceable strategy improvement from the current portfolio.",
    workflowSandboxDescription:
      "Clone the real snapshot into isolation and run a simulation branch.",
    snapshotFinal: "Final",
    snapshotPartial: "Partial data",
    assessmentOnTrack: "On track",
    assessmentWatch: "Watch",
    assessmentBreached: "Constraint breached",
    assessmentInsufficient: "Insufficient data",
    capabilitiesTitle: "Core capabilities",
    capabilitiesDescription:
      "Choose a task to begin. The Agent reads existing context first and asks only when a key input is truly missing.",
    portfolioTitle: "Personal portfolio strategy",
    portfolioDescription:
      "Let the Agent read your portfolios, accounts, and strategy versions to build an evolving personal investment roadmap.",
    portfolioAction: "Manage my portfolio",
    portfolioFeatures: [
      "Portfolio and account context",
      "Strategy versioning",
      "Attribution and risk constraints",
    ],
    portfolioPrompt: "View and manage my investment portfolios.",
    reviewTitle: "Daily strategy review and feedback",
    reviewDescription:
      "Review active strategies against immutable snapshots and current market evidence, separating facts, judgments, changes, and data gaps.",
    reviewAction: "Start today's review",
    reviewFeatures: [
      "Immutable daily snapshots",
      "Fact Pack evidence",
      "Strategy feedback and improvements",
    ],
    reviewPrompt: "Review today's portfolio strategy.",
    sandboxTitle: "Isolated simulation sandbox",
    sandboxDescription:
      "Clone a real portfolio snapshot into an isolated environment, compare baseline and experiment branches, and keep every order in the simulation ledger.",
    sandboxAction: "Create a sandbox",
    sandboxFeatures: [
      "Snapshot cloning and isolation",
      "Baseline / experiment branches",
      "Virtual orders and comparison",
    ],
    sandboxPrompt: "Create a simulation sandbox from my portfolio.",
    overviewPrompt:
      "Review my investment portfolios and tell me what deserves attention now.",
    workflowTitle: "How the Agent completes a task",
    workflowDescription:
      "Orchestration stays inside MetaInsight. This page never bypasses the Agent with keyword routing or direct high-risk API calls.",
    workflowSteps: [
      {
        title: "Read user context",
        description:
          "Load accessible portfolios, accounts, strategies, and snapshots for the signed-in user.",
      },
      {
        title: "Discover capabilities",
        description:
          "Select the read and write tools needed for this task from the runtime catalog.",
      },
      {
        title: "Deep research and analysis",
        description:
          "Combine Fact Packs, market evidence, and strategy constraints into auditable conclusions.",
      },
      {
        title: "Complete and report",
        description:
          "Execute local records and sandbox actions directly, then return a clear result.",
      },
    ],
    trustTitle: "Native safety boundaries",
    trustDescription:
      "Investment capabilities inherit MetaInsight identity, task, and conversation state without exposing bridge secrets or execution rules to the browser.",
    trustItems: [
      "User identity isolation",
      "Task-bound intents",
      "Audited local actions",
      "Real / simulated portfolio isolation",
    ],
    customTitle: "Custom agents",
    customDescription:
      "Create and manage purpose-built agents with dedicated prompts, skills, and tool groups.",
    backToPortfolios: "Back to portfolios",
  },

  // Breadcrumb
  breadcrumb: {
    workspace: "Workspace",
    chats: "Chats",
  },

  // Workspace
  workspace: {
    officialWebsite: "MetaInsight official website",
    githubTooltip: "MetaInsight source repository",
    settingsAndMore: "Settings and more",
    visitGithub: "MetaInsight on GitHub",
    reportIssue: "Report a issue",
    contactUs: "Contact us",
    about: "About MetaInsight",
    logout: "Log out",
    gatewayUnavailable: "Gateway is temporarily unavailable.",
    gatewayUnavailableRetrying: "Retrying in the background…",
  },

  // Conversation
  conversation: {
    noMessages: "No messages yet",
    startConversation: "Start a conversation to see messages here",
  },

  // Chats
  chats: {
    searchChats: "Search chats",
    loadMoreToSearch: "Load more to search older conversations",
    loadingMore: "Loading more...",
    loadOlderChats: "Load older chats",
  },

  // Channels
  channels: {
    title: "Channels",
    connect: "Connect",
    modify: "Modify",
    reconnect: "Reconnect",
    disconnect: "Disconnect",
    connected: "Connected",
    notConnected: "Not connected",
    pending: "Pending",
    revoked: "Disconnected",
    disabled: "Disabled",
    unconfigured: "Not configured",
    unavailable: "Channel connections are unavailable right now.",
    unavailableShort: "Unavailable",
    setupTitle: (name: string) => `Connect ${name}`,
    setupEditTitle: (name: string) => `Modify ${name}`,
    setupDescription:
      "Enter the values needed by this server process. They are not written to config.yaml.",
    saveAndConnect: "Save and connect",
    saveChanges: "Save changes",
    descriptions: {
      telegram: "Telegram direct messages through your MetaInsight bot.",
      slack: "Slack workspace messages and mentions.",
      discord: "Discord server messages through your MetaInsight bot.",
      feishu: "Feishu and Lark messages through your MetaInsight app.",
      dingtalk: "DingTalk Stream Push messages through your MetaInsight bot.",
      wechat: "WeChat iLink messages through your MetaInsight bot.",
      wecom: "WeCom messages through your MetaInsight AI bot.",
    },
    connectedAs: (name: string) => `Connected as ${name}.`,
  },

  // Page titles (document title)
  pages: {
    appName: "MetaInsight",
    chats: "Chats",
    newChat: "New chat",
    untitled: "Untitled",
  },

  // Tool calls
  toolCalls: {
    moreSteps: (count: number) => `${count} more step${count === 1 ? "" : "s"}`,
    lessSteps: "Less steps",
    executeCommand: "Execute command",
    presentFiles: "Present files",
    needYourHelp: "Need your help",
    useTool: (toolName: string) => `Use "${toolName}" tool`,
    searchFor: (query: string) => `Search for "${query}"`,
    searchForRelatedInfo: "Search for related information",
    searchForRelatedImages: "Search for related images",
    searchForRelatedImagesFor: (query: string) =>
      `Search for related images for "${query}"`,
    searchOnWebFor: (query: string) => `Search on the web for "${query}"`,
    viewWebPage: "View web page",
    listFolder: "List folder",
    readFile: "Read file",
    writeFile: "Write file",
    clickToViewContent: "Click to view file content",
    writeTodos: "Update to-do list",
    skillInstallTooltip: "Install skill and make it available to MetaInsight",
  },

  // Subtasks
  uploads: {
    uploading: "Uploading...",
    uploadingFiles: "Uploading files, please wait...",
  },

  subtasks: {
    subtask: "Subtask",
    executing: (count: number) =>
      `Executing ${count === 1 ? "" : count + " "}subtask${count === 1 ? "" : "s in parallel"}`,
    in_progress: "Running subtask",
    completed: "Subtask completed",
    failed: "Subtask failed",
  },

  // Token Usage
  tokenUsage: {
    title: "Token Usage",
    label: "Tokens",
    input: "Input",
    output: "Output",
    total: "Total",
    view: "Display",
    unavailable:
      "No token usage yet. Usage appears only after a successful model response when the provider returns usage_metadata.",
    unavailableShort: "No usage returned",
    note: "Header totals use persisted thread usage, plus visible in-flight usage while a run is still streaming. Per-turn and debug usage come from currently visible messages only. Totals may differ from provider billing pages.",
    presets: {
      off: "Off",
      summary: "Summary",
      perTurn: "Per turn",
      debug: "Debug",
    },
    presetDescriptions: {
      off: "Hide token usage in the header and conversation.",
      summary: "Show only the current conversation total in the header.",
      perTurn:
        "Show the header total and one token summary per assistant turn.",
      debug: "Show the header total and step-level token debugging details.",
    },
    finalAnswer: "Final answer",
    stepTotal: "Step total",
    sharedAttribution: "Shared across multiple actions in this step",
    subagent: (description: string) => `Subagent: ${description}`,
    startTodo: (content: string) => `Start To-do: ${content}`,
    completeTodo: (content: string) => `Complete To-do: ${content}`,
    updateTodo: (content: string) => `Update To-do: ${content}`,
    removeTodo: (content: string) => `Remove To-do: ${content}`,
  },

  // Shortcuts
  shortcuts: {
    searchActions: "Search actions...",
    noResults: "No results found.",
    actions: "Actions",
    keyboardShortcuts: "Keyboard Shortcuts",
    keyboardShortcutsDescription:
      "Navigate MetaInsight faster with keyboard shortcuts.",
    openCommandPalette: "Open Command Palette",
    toggleSidebar: "Toggle Sidebar",
  },

  // Settings
  settings: {
    title: "Settings",
    description: "Adjust how MetaInsight looks and behaves for you.",
    sections: {
      account: "Account",
      appearance: "Appearance",
      channels: "Channels",
      memory: "Memory",
      tools: "Tools",
      skills: "Skills",
      notification: "Notification",
      about: "About",
    },
    memory: {
      title: "Memory",
      description:
        "MetaInsight automatically learns from your conversations in the background. These memories help MetaInsight understand you better and deliver a more personalized experience.",
      empty: "No memory data to display.",
      rawJson: "Raw JSON",
      exportButton: "Export memory",
      exportSuccess: "Memory exported",
      importButton: "Import memory",
      importConfirmTitle: "Import memory?",
      importConfirmDescription:
        "This will overwrite your current memory with the selected JSON backup.",
      importFileLabel: "Selected file",
      importInvalidFile:
        "Failed to read the selected memory file. Please choose a valid JSON export.",
      importSuccess: "Memory imported",
      manualFactSource: "Manual",
      addFact: "Add fact",
      addFactTitle: "Add memory fact",
      editFactTitle: "Edit memory fact",
      addFactSuccess: "Fact created",
      editFactSuccess: "Fact updated",
      clearAll: "Clear all memory",
      clearAllConfirmTitle: "Clear all memory?",
      clearAllConfirmDescription:
        "This will remove all saved summaries and facts. This action cannot be undone.",
      clearAllSuccess: "All memory cleared",
      factDeleteConfirmTitle: "Delete this fact?",
      factDeleteConfirmDescription:
        "This fact will be removed from memory immediately. This action cannot be undone.",
      factDeleteSuccess: "Fact deleted",
      factContentLabel: "Content",
      factCategoryLabel: "Category",
      factConfidenceLabel: "Confidence",
      factContentPlaceholder: "Describe the memory fact you want to save",
      factCategoryPlaceholder: "context",
      factConfidenceHint: "Use a number between 0 and 1.",
      factSave: "Save fact",
      factValidationContent: "Fact content cannot be empty.",
      factValidationConfidence: "Confidence must be a number between 0 and 1.",
      noFacts: "No saved facts yet.",
      summaryReadOnly:
        "Summary sections are read-only for now. You can currently add, edit, or delete individual facts, or clear all memory.",
      memoryFullyEmpty: "No memory saved yet.",
      factPreviewLabel: "Fact to delete",
      searchPlaceholder: "Search memory",
      filterAll: "All",
      filterFacts: "Facts",
      filterSummaries: "Summaries",
      noMatches: "No matching memory found.",
      markdown: {
        overview: "Overview",
        userContext: "User context",
        work: "Work",
        personal: "Personal",
        topOfMind: "Top of mind",
        historyBackground: "History",
        recentMonths: "Recent months",
        earlierContext: "Earlier context",
        longTermBackground: "Long-term background",
        updatedAt: "Updated at",
        facts: "Facts",
        empty: "(empty)",
        table: {
          category: "Category",
          confidence: "Confidence",
          confidenceLevel: {
            veryHigh: "Very high",
            high: "High",
            normal: "Normal",
            unknown: "Unknown",
          },
          content: "Content",
          source: "Source",
          createdAt: "CreatedAt",
          view: "View",
        },
      },
    },
    appearance: {
      themeTitle: "Theme",
      themeDescription:
        "Choose how the interface follows your device or stays fixed.",
      system: "System",
      light: "Light",
      dark: "Dark",
      systemDescription: "Match the operating system preference automatically.",
      lightDescription: "Bright palette with higher contrast for daytime.",
      darkDescription: "Dim palette that reduces glare for focus.",
      languageTitle: "Language",
      languageDescription: "Switch between languages.",
    },
    tools: {
      title: "Tools",
      description: "Manage the configuration and enabled status of MCP tools.",
      adminRequired: "Admin privileges are required to manage MCP tools.",
      empty: "No MCP tools configured.",
    },
    channels: {
      title: "Channels",
      description:
        "Connect IM accounts that can send messages to MetaInsight from outside the browser.",
      disabled:
        "Channel connections are not enabled on this server. Ask an administrator to enable channel_connections.",
    },
    skills: {
      title: "Agent Skills",
      description:
        "Manage the configuration and enabled status of the agent skills.",
      createSkill: "Create skill",
      emptyTitle: "No agent skill yet",
      emptyDescription:
        "Put your agent skill folders under the `/skills/custom` folder in the MetaInsight deployment root.",
      emptyButton: "Create Your First Skill",
    },
    notification: {
      title: "Notification",
      description:
        "MetaInsight only sends a completion notification when the window is not active. This is especially useful for long-running tasks so you can switch to other work and get notified when done.",
      requestPermission: "Request notification permission",
      deniedHint:
        "Notification permission was denied. You can enable it in your browser's site settings to receive completion alerts.",
      testButton: "Send test notification",
      testTitle: "MetaInsight",
      testBody: "This is a test notification.",
      notSupported: "Your browser does not support notifications.",
      disableNotification: "Disable notification",
    },
    account: {
      profileTitle: "Profile",
      email: "Email",
      role: "Role",
      changePasswordTitle: "Change Password",
      changePasswordDescription: "Update your account password.",
      currentPassword: "Current password",
      newPassword: "New password",
      confirmNewPassword: "Confirm new password",
      passwordMismatch: "New passwords do not match",
      passwordTooShort: "Password must be at least 8 characters",
      passwordChangedSuccess: "Password changed successfully",
      networkError: "Network error. Please try again.",
      updating: "Updating...",
      updatePassword: "Update Password",
      signOut: "Sign Out",
    },
    acknowledge: {
      emptyTitle: "Acknowledgements",
      emptyDescription: "Credits and acknowledgements will show here.",
    },
  },
};
