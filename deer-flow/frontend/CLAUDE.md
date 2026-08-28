# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeerFlow Frontend is a Next.js 16 web interface for an AI agent system. It communicates with a LangGraph-based backend to provide thread-based AI conversations with streaming responses, artifacts, and a skills/tools system.

**Stack**: Next.js 16, React 19, TypeScript 5.8, Tailwind CSS 4, pnpm 10.26.2

## Commands

| Command          | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Dev server with Turbopack (http://localhost:3000) |
| `pnpm build`     | Production build                                  |
| `pnpm check`     | Lint + type check (run before committing)         |
| `pnpm lint`      | ESLint only                                       |
| `pnpm lint:fix`  | ESLint with auto-fix                              |
| `pnpm test`      | Run unit tests with Rstest                        |
| `pnpm test:e2e`  | Run E2E tests with Playwright (Chromium)          |
| `pnpm typecheck` | TypeScript type check (`tsc --noEmit`)            |
| `pnpm start`     | Start production server                           |

Unit tests live under `tests/unit/` and mirror the `src/` layout (e.g., `tests/unit/core/api/stream-mode.test.ts` tests `src/core/api/stream-mode.ts`). Powered by Rstest; import source modules via the `@/` path alias.

E2E tests live under `tests/e2e/` and use Playwright with Chromium. They mock all backend APIs via `page.route()` network interception and test real page interactions (navigation, chat input, streaming responses). Config: `playwright.config.ts`.

## Architecture

```
Frontend (Next.js) ──▶ LangGraph SDK ──▶ LangGraph Backend (lead_agent)
                                              ├── Sub-Agents
                                              └── Tools & Skills
```

The frontend is a stateful chat application. Users create **threads** (conversations), send messages, and receive streamed AI responses. The backend orchestrates agents that can produce **artifacts** (files/code) and **todos**.

### Source Layout (`src/`)

- **`app/`** — Next.js App Router. Routes: `/` (landing), `/workspace/chats/[thread_id]` (chat).
- **`components/`** — React components split into:
  - `ui/` — Shadcn UI primitives (auto-generated, ESLint-ignored)
  - `ai-elements/` — Vercel AI SDK elements (auto-generated, ESLint-ignored)
  - `workspace/` — Chat page components (messages, artifacts, settings)
  - `landing/` — Landing page sections
- **`core/`** — Business logic, the heart of the app:
  - `threads/` — Thread creation, streaming, state management (hooks + types)
  - `api/` — LangGraph client singleton
  - `artifacts/` — Artifact loading and caching
  - `channels/` — IM channel connections (provider catalog, connect/runtime-config API + hooks)
  - `i18n/` — Internationalization (en-US, zh-CN)
  - `settings/` — User preferences in localStorage
  - `memory/` — Persistent user memory system
  - `skills/` — Skills installation and management
  - `messages/` — Message processing and transformation
  - `mcp/` — Model Context Protocol integration
  - `agents/investment-chat.ts` — Safe investment capability-center chat handoff
  - `finance/` — Owner-scoped portfolio dashboard API, types, query hook, and
    portfolio-bound Agent prompt helpers
  - `models/` — TypeScript types and data models
- **`hooks/`** — Shared React hooks
- **`lib/`** — Utilities (`cn()` from clsx + tailwind-merge)
- **`server/`** — Server-side code (better-auth, not yet active)
- **`styles/`** — Global CSS with Tailwind v4 `@import` syntax and CSS variables for theming

### Data Flow

1. User input → thread hooks (`core/threads/hooks.ts`) → LangGraph SDK streaming
2. Stream events update thread state (messages, artifacts, todos)
3. TanStack Query manages server state; localStorage stores user settings
4. Components subscribe to thread state and render updates

### DSA notification ownership

- `src/components/workspace/research-notification-center.tsx` owns the
  persistent DSA inbox in the sidebar. It reads the account-scoped Gateway API
  and reuses `src/core/notification/hooks.ts` for optional background desktop
  delivery; browser notification state is never the durable source of truth.
- `src/components/market/dsa-auto-research-panel.tsx` owns the current
  account's post-close DSA settings and is mounted by the watchlist workspace.
- The watchlist is intentionally styled as a flat research terminal. Keep its
  overview, automation controls, filters, and research table separated by
  rules and spacing rather than nested `Card` shells, decorative icon tiles,
  or status-pill grids.
- Keep automatic-research settings behind the header dialog trigger; do not
  restore a persistent settings panel in the watchlist body. Desktop expanded
  details belong in a sibling `<tr>` directly after their stock row, never in a
  shared block below the table.
- The market workspace follows the same research-terminal hierarchy. Keep the
  market pulse as a compact summary band, indices and sectors as comparison
  grids, news and research as divided lists, and the watchlist as a separate
  rail. Do not restore the large AI-summary hero, nested dashboard cards,
  colored status badges, or per-index card tiles.
- Market and watchlist components must call `/api/v1/market/*`, never the
  upstream `/market-api/*` service. The Gateway owns the public/private data
  boundary and adds CSRF enforcement for mutations.
- Account-private browser state must use
  `core/auth/account-storage.ts::accountStorageKey`. News preferences and
  portfolio setup drafts are current examples; do not add new unscoped keys
  for saved records, drafts, watchlists, or other user data.
- The news workspace reads only `/api/v1/news/*`; direct `/finance-api/*`
  browser calls are forbidden. Topics, saved events, and notification choices
  synchronize with `/api/v1/news-preferences`, while the account-scoped local
  record remains an offline cache. Event detail must keep source links and
  independent-evidence labels visible and preserve the originating feed when
  returning. The combined personalized feed is ranked after channel
  de-duplication and is intentionally capped at 20 initial events. It uses one
  unified ranking rather than separate top/latest controls with
  indistinguishable results. Topic and alert preferences live behind the compact
  header Follow dialog. The right rail presents local weather and market
  context, not a second copy or statistical restatement of the main event
  ranking. Weather requests
  use coarse coordinates, never force a permission prompt on load, and retain a
  non-blocking fallback when geolocation is unavailable. Keep the frontend-owned
  weather endpoint at `/workspace/weather-data`; production nginx reserves
  `/api/*` for Gateway and forwards the workspace namespace to this app.

### Investment Agent UI boundary

- `/workspace/agents` is the native investment capability center and also keeps
  the existing custom-agent gallery available.
- The page reads `/api/finance/portfolio-dashboard` to display existing
  portfolios, strategies, snapshots, reviews, positions, and cash without
  starting a conversation. This endpoint is read-only and owner-scoped by the
  Gateway session.
- Capability cards create a new DeerFlow chat and auto-send one visible short
  prompt through the normal streaming thread flow. They contain no finance
  tool-selection logic: express the user's intent and the stable portfolio ID
  only.
- Finance capability discovery, identity scoping, deep research, audited direct
  execution, and any future confirmation policy stay in the backend Agent/tool
  layer.
- `ChatProviders` accepts the generic `prompt` query parameter and seeds
  `PromptInputProvider`. The chat page auto-submits only the scoped
  `source=investment-agent&autostart=1` portfolio handoff; all other prefilled
  prompts remain under explicit user control.

### Key Patterns

- **Server Components by default**, `"use client"` only for interactive components
- **Thread hooks** (`useThreadStream`, `useSubmitThread`, `useThreads`) are the primary API interface
- **LangGraph client** is a singleton obtained via `getAPIClient()` in `core/api/`
- **Environment validation** uses `@t3-oss/env-nextjs` with Zod schemas (`src/env.js`). Skip with `SKIP_ENV_VALIDATION=1`

## Code Style

- **Imports**: Enforced ordering (builtin → external → internal → parent → sibling), alphabetized, newlines between groups. Use inline type imports: `import { type Foo }`.
- **Unused variables**: Prefix with `_`.
- **Class names**: Use `cn()` from `@/lib/utils` for conditional Tailwind classes.
- **Path alias**: `@/*` maps to `src/*`.
- **Components**: `ui/` and `ai-elements/` are generated from registries (Shadcn, MagicUI, React Bits, Vercel AI SDK) — don't manually edit these.

## Environment

Backend API URLs are optional; an nginx proxy is used by default:

```
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8001
NEXT_PUBLIC_LANGGRAPH_BASE_URL=http://localhost:8001/api
```

Leave these unset for the standard `make dev` / Docker flow, where nginx serves
the public `/api/langgraph/*` prefix and rewrites it to Gateway's native `/api/*`
routes.

Requires Node.js 22+ and pnpm 10.26.2+.
