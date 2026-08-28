# Agents Architecture

## Overview

DeerFlow is built on a sophisticated agent-based architecture using the [LangGraph SDK](https://github.com/langchain-ai/langgraph) to enable intelligent, stateful AI interactions. This document outlines the agent system architecture, patterns, and best practices for working with agents in the frontend application.

## Architecture Overview

### Core Components

```
┌────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                  │
├────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ UI Components│───▶│ Thread Hooks │───▶│ LangGraph│  │
│  │              │    │              │    │   SDK    │  │
│  └──────────────┘    └──────────────┘    └──────────┘  │
│         │                    │                  │      │
│         │                    ▼                  │      │
│         │            ┌──────────────┐           │      │
│         └───────────▶│ Thread State │◀──────────┘      │
│                      │  Management  │                  │
│                      └──────────────┘                  │
└────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────┐
│              LangGraph Backend (lead_agent)            │
│  ┌────────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │Main Agent  │─▶│Sub-Agents│─▶│  Tools & Skills   │   │
│  └────────────┘  └──────────┘  └───────────────────┘   │
└────────────────────────────────────────────────────────┘
```

## Project Structure

```
tests/
├── e2e/                    # E2E tests (Playwright, Chromium, mocked backend)
└── unit/                   # Unit tests (mirrors src/ layout, powered by Rstest)
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   ├── workspace/          # Main workspace pages
│   └── mock/               # Mock/demo pages
├── components/             # React components
│   ├── ui/                 # Reusable UI components
│   ├── workspace/          # Workspace-specific components
│   ├── landing/            # Landing page components
│   └── ai-elements/        # AI-related UI elements
├── core/                   # Core business logic
│   ├── api/                # API client & data fetching
│   ├── artifacts/          # Artifact management
│   ├── channels/           # IM channel connections (providers, connect flow)
│   ├── config/              # App configuration
│   ├── i18n/               # Internationalization
│   ├── mcp/                # MCP integration
│   ├── messages/           # Message handling
│   ├── models/             # Data models & types
│   ├── settings/           # User settings
│   ├── skills/             # Skills system
│   ├── threads/            # Thread management
│   ├── todos/              # Todo system
│   └── utils/              # Utility functions
├── hooks/                  # Custom React hooks
├── lib/                    # Shared libraries & utilities
├── server/                 # Server-side code (Not available yet)
│   └── better-auth/        # Authentication setup (Not available yet)
└── styles/                 # Global styles
```

### Technology Stack

- **LangGraph SDK** (`@langchain/langgraph-sdk@1.5.3`) - Agent orchestration and streaming
- **LangChain Core** (`@langchain/core@1.1.15`) - Fundamental AI building blocks
- **TanStack Query** (`@tanstack/react-query@5.90.17`) - Server state management
- **React Hooks** - Thread lifecycle and state management
- **Shadcn UI** - UI components
- **MagicUI** - Magic UI components
- **React Bits** - React bits components

### Interaction Ownership

- `src/app/workspace/chats/[thread_id]/page.tsx` owns composer busy-state wiring.
- `src/components/workspace/agents/agent-gallery.tsx` presents the investment
  portfolio workspace. Custom-agent management lives on the separate
  `/workspace/agents/custom` route so it does not compete with portfolio data.
- `src/components/workspace/agents/portfolio-dashboard.tsx` renders the current
  user's portfolio workspace. Its always-visible create action opens the
  structured setup wizard in place, and its portfolio switcher owns the
  overview, holdings, daily-review, risk, strategy, and sandbox views.
  Page-first setup sends structured data through the authenticated finance
  Gateway; it does not synthesize an Agent chat. Portfolio analysis actions
  open the normal DeerFlow conversation and use its standard
  streaming/tool-progress UI. Their complete execution prompt remains available
  to the Agent, while the message bubble, generated title, clipboard, and recent
  chat list use a compact workflow label stored in structured message metadata.
  The UI selects only the user workflow intent and stable portfolio ID;
  capability discovery, finance-tool selection, ownership checks, and execution
  policy remain in the Agent/runtime capability layer.
- `src/core/finance/` owns the portfolio projection and setup contracts, query
  hooks, CSV parsing, and portfolio-bound normal-chat handoff prompts.
- `src/core/finance/news.ts` owns safe news-event and source-article follow-up
  links and the structured context envelope. News UI entry points open the
  normal chat with a bounded, untrusted source card while the composer remains
  reserved for the user's question; they never auto-submit it. The new-thread
  news route uses a dedicated, vertically bounded news follow-up welcome state
  instead of stacking the generic welcome hero above the composer. Its prompt
  suggestions only populate the composer and never submit on the user's behalf.
  Consumer news surfaces use one event-level media/report count, keep collector
  and model-health diagnostics out of the feed, and reserve the primary
  follow-up action for the event detail page. The personalized feed may fetch
  channel candidates independently, but must de-duplicate, rank, and cap the
  combined initial result rather than render every channel page end-to-end.
  Present one unified ranked feed; do not add parallel top/latest controls when
  the available event pool makes their output materially identical. Topic and
  alert preferences belong behind the compact header Follow dialog. The desktop
  right rail must stay complementary with local weather and market context;
  never repeat the same ranked event titles or aggregate the visible feed into
  a second overview. Weather may use an
  already-granted browser location, but must not force a permission prompt on
  page load and must retain a non-blocking fallback. The frontend-owned weather
  endpoint lives at `/workspace/weather-data`: production nginx reserves
  `/api/*` for Gateway and forwards only the workspace namespace to this app.
  Feed, ranking, health, and detail reads use the authenticated
  `/api/v1/news/*` Gateway facade. Followed topics, saved events, and news
  notifications synchronize through `/api/v1/news-preferences`; localStorage
  is an account-scoped offline cache, never the authoritative shared state.
- `src/core/agents/investment-chat.ts` owns safe capability-center chat URLs and
  prompt normalization; backend Agent tools still own discovery and execution.
- `src/components/workspace/messages/markdown-content.tsx` owns shared assistant
  Markdown presentation, including inline citations, external evidence links,
  blockquotes, and standalone Sources/References sections. Message-specific
  component overrides must delegate ordinary links back to this renderer so
  archived and live conversations keep the same evidence styling.
- `src/core/threads/hooks.ts` owns pre-submit upload state and thread submission.
- `src/hooks/usePoseStream.ts` is a passive store selector; global WebSocket lifecycle stays in `App.tsx`.

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain Core Concepts](https://js.langchain.com/docs/concepts)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Next.js App Router](https://nextjs.org/docs/app)

## Contributing

When adding new agent features:

1. Follow the established project structure
2. Add comprehensive TypeScript types
3. Implement proper error handling
4. Write unit tests under `tests/unit/` (run with `pnpm test`) and E2E tests under `tests/e2e/` (run with `pnpm test:e2e`)
5. Update this documentation
6. Follow the code style guide (ESLint + Prettier)

## License

This agent architecture is part of the DeerFlow project.
