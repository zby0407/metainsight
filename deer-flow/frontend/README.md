# DeerFlow Frontend

Like the original DeerFlow 1.0, we would love to give the community a minimalistic and easy-to-use web interface with a more modern and flexible architecture.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with [App Router](https://nextjs.org/docs/app)
- **UI**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/), [MagicUI](https://magicui.design/) and [React Bits](https://reactbits.dev/)
- **AI Integration**: [LangGraph SDK](https://www.npmjs.com/package/@langchain/langgraph-sdk) and [Vercel AI Elements](https://vercel.com/ai-sdk/ai-elements)

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.26.2+

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Build & Test

```bash
# Type check
pnpm typecheck

# Check formatting
pnpm format

# Apply formatting
pnpm format:write

# Lint
pnpm lint

# Run unit tests
pnpm test

# One-time setup: install Playwright Chromium browser
pnpm exec playwright install chromium

# Run E2E tests (builds and starts production server automatically)
pnpm test:e2e

# Build for production
pnpm build

# Start production server
pnpm start
```

## Site Map

```
├── /                              # Landing page
├── /workspace/chats               # Chat list
├── /workspace/chats/new           # New chat page
├── /workspace/chats/[thread_id]   # A specific chat page
└── /workspace/agents              # Investment Agent capability center
```

## Investment Agent capability center

`/workspace/agents` presents the DeerFlow-native investment workflow alongside
the existing custom-agent gallery. Its **My portfolios** section directly shows
the signed-in user's portfolios, active strategies, latest immutable snapshots,
review conclusions, positions, and cash balances. The data comes from the
Gateway's owner-scoped, read-only `/api/finance/portfolio-dashboard` projection;
the finance bridge secret never reaches the browser.

Portfolio-specific review, risk, strategy, and sandbox actions open the normal
DeerFlow chat, auto-submit a short visible prompt with the selected portfolio's
stable ID, and stream the Agent's progress there. The browser never selects a
finance capability or executes investment business logic.

Runtime capability discovery, user-scoped data access, deep-research
orchestration, and task-bound confirmation remain owned by the DeerFlow Agent
and its backend finance tools.

## Post-close DSA notifications

`/workspace/watchlist` lets each signed-in account select up to ten A-share
symbols for automatic post-close DSA research. Results are retained in the
Gateway notification inbox and exposed through the sidebar bell with unread
state, history, and links back to the relevant research. When the page is not
visible, new inbox items reuse the existing browser notification permission and
the notification preference configured in Settings; the inbox remains
available even when desktop notifications are disabled.

The watchlist UI uses a flat research-terminal hierarchy: a compact market
summary, a header-level automation dialog, a single toolbar, and a dense data
table. Avoid stacking dashboard cards, decorative status pills, or icon tiles
around these controls; market data and research recency should remain the
primary visual signals.

Because automatic-research settings are changed infrequently, they open from
the compact **Auto research** control in the page header instead of occupying a
persistent content section. Expanded stock details render immediately beneath
the selected table row.

All stock workspace requests use the authenticated Gateway
`/api/v1/market/*` facade; the browser never calls the shared stock service
directly. News preferences, saved events, and unfinished portfolio setup drafts
use `deepmem.user.<user-id>.*` browser-storage namespaces so switching accounts
on the same device cannot surface another account's local state.

The stock-market workspace uses the same restrained research-terminal system:
a compact market summary band, border-separated index and sector comparisons,
divided news and research lists, and a dedicated watchlist rail. Market data is
the visual emphasis; large generated-summary cards, decorative badges, and
nested dashboard shells are intentionally avoided.

## Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Backend API URL (optional, uses local Next.js/nginx proxy by default)
NEXT_PUBLIC_BACKEND_BASE_URL="http://localhost:8001"
# LangGraph-compatible API URL (optional, uses local Next.js/nginx proxy by default)
NEXT_PUBLIC_LANGGRAPH_BASE_URL="http://localhost:8001/api"
```

## Project Structure

```
tests/
├── e2e/                    # E2E tests (Playwright, Chromium, mocked backend)
└── unit/                   # Unit tests (mirrors src/ layout)
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
├── server/                 # Server-side code
│   └── better-auth/        # Authentication setup and session helpers
└── styles/                 # Global styles
```

## Scripts

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Start development server with Turbopack |
| `pnpm build`        | Build for production                    |
| `pnpm start`        | Start production server                 |
| `pnpm test`         | Run unit tests with Rstest              |
| `pnpm test:e2e`     | Run E2E tests with Playwright           |
| `pnpm format`       | Check formatting with Prettier          |
| `pnpm format:write` | Apply formatting with Prettier          |
| `pnpm lint`         | Run ESLint                              |
| `pnpm lint:fix`     | Fix ESLint issues                       |
| `pnpm typecheck`    | Run TypeScript type checking            |
| `pnpm check`        | Run both lint and typecheck             |

## Development Notes

- Uses pnpm workspaces (see `packageManager` in package.json)
- Turbopack enabled by default in development for faster builds
- Environment validation can be skipped with `SKIP_ENV_VALIDATION=1` (useful for Docker)
- Backend API URLs are optional; nginx proxy is used by default in development

## License

MIT License. See [LICENSE](../LICENSE) for details.
