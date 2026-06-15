# Deep Agents UI — VSDA

The chat frontend for the [VSDA Deep Agent](../vsda-deep-agent). A
Next.js (App Router) / React application that connects to the VSDA LangGraph
deployment via [`@langchain/langgraph-sdk`](https://www.npmjs.com/package/@langchain/langgraph-sdk)
and authenticates against the project's FastAPI backend.

This is a customized fork of
[`langchain-ai/deep-agents-ui`](https://github.com/langchain-ai/deep-agents-ui).
On top of the upstream chat surface it adds JWT authentication, role-based
access (`user` / `developer` / `admin`), per-user model and connectivity
selection, weekly token budgets, an admin panel, human-in-the-loop tool
approvals, file/workspace views, and Aptiv branding.

## Quick Start

```bash
# 1. Use the pinned Node version (20)
nvm use                       # reads .nvmrc

# 2. Install dependencies (Yarn 1.x — the repo is yarn-locked)
yarn install

# 3. Configure the deployment URL
cp .env.example .env          # set NEXT_PUBLIC_DEPLOYMENT_URL

# 4. Run the dev server (http://localhost:3000)
yarn dev
```

In development the app proxies `/api/*` to the LangGraph + FastAPI runtime at
`http://localhost:2024` (override with `LANGGRAPH_API_URL`), so start the backend
(`make dev` in [`../vsda-deep-agent`](../vsda-deep-agent)) alongside the UI.

Open <http://localhost:3000>, register or log in, and start a chat. Account,
model, connectivity, and (for admins) user-management controls live behind the
header menu and sidebars.

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Dev server with Turbopack on `localhost:3000` |
| `yarn build` | Production build (static export when `NEXT_STATIC_EXPORT=1`) |
| `yarn start` | Serve a non-export production build |
| `yarn lint` / `yarn lint:fix` | ESLint |
| `yarn format` / `yarn format:check` | Prettier |
| `yarn test` | Node test runner over `tests/**/*.mjs` |

## Configuration

Environment variables (see `.env.example`):

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_DEPLOYMENT_URL` | Yes | LangGraph deployment URL the UI connects to |
| `NEXT_PUBLIC_LANGSMITH_API_KEY` | No | LangSmith key for tracing/deployed graphs |
| `LANGGRAPH_API_URL` | No | Dev-only override for the `/api/*` proxy target |

The assistant ID is selected in the UI and stored in `localStorage`; the JWT from
login is also kept client-side and attached to backend requests.

### Deployment profiles

`next.config.ts` selects behavior by build mode:

- **dev** (`next dev`) — talks to `http://localhost:2024`; rewrites proxy `/api/*`.
- **build / deploy** (`NEXT_STATIC_EXPORT=1`) — a **static export** served under
  `basePath: /chat`, with the API URL baked in at build time from
  `NEXT_PUBLIC_DEPLOYMENT_URL`. Static exports ignore rewrites, so there is no
  dev proxy in this mode.

Production builds are orchestrated from the backend repo: `make build` /
`make deploy` in [`../vsda-deep-agent`](../vsda-deep-agent) run
`scripts/rebuild.sh`, which builds this UI, copies the export into the backend's
static-files directory, and serves it from the FastAPI app on port 8000.

## Architecture

App Router layout under `src/`:

```
src/
  app/
    page.tsx                 Main chat experience
    login/, forgot-password/ Auth screens
    components/              Chat UI, sidebars, dialogs, approvals
    hooks/                   useChat, useThreads, useTokenUsage, ...
    types/                   Shared TS types
    utils/                   Stream modes, markdown helpers
  providers/                 Auth, Chat, Client, Connectivity, Notifications, Theme
  lib/                       auth, config, uploads, utils
  components/ui/             Reusable primitives (Radix-based)
```

Key pieces:

- **Auth & roles** — `providers/AuthProvider.tsx` + `lib/auth.ts`. JWTs are
  decoded client-side for role/expiry; role gates which sidebars and tools appear.
- **Chat streaming** — `hooks/useChat.ts` drives the LangGraph stream;
  `ChatInterface` / `ChatMessage` render it. `buildConfig()` injects the
  `system_username` the backend uses to resolve per-user tokens.
- **Conversation Projection** — an identity-stable transform
  (`hooks/internal/conversationProjection.ts`) that reconciles tool results into
  their calls and preserves referential identity so memoized renderers skip work
  during streaming. See [`CONTEXT.md`](./CONTEXT.md) for the rationale.
- **Markdown** — `MarkdownContent` renders GitHub-flavored Markdown
  (`remark-gfm`), LaTeX (`remark-math` + `rehype-katex`), and highlighted code.
- **Human-in-the-loop** — `ToolApprovalInterrupt` / `BatchToolApprovalInterrupt`
  surface approve / edit / reject prompts for write-capable tools.
- **Model, connectivity & budgets** — `ModelSelector` / `ModelSidebar`,
  `ConnectivitySidebar`, and `TokenManagementSidebar` / `useTokenUsage` map to
  the backend's per-user model selection and weekly token-budget endpoints.
- **Admin** — `AdminPanel` / `UserManagementSidebar` for user and role
  management (admin role only).

## Tech Stack

- Next.js 16 (App Router) · React 19 · TypeScript 5
- Tailwind CSS 3.4 with Radix UI primitives
- `@langchain/langgraph-sdk` for streaming
- Node 20 (`.nvmrc`) · Yarn 1.22 (`packageManager`)

## Related

- Backend & agent graphs: [`../vsda-deep-agent`](../vsda-deep-agent)
- Upstream project: https://github.com/langchain-ai/deep-agents-ui
- Deep Agents: https://github.com/langchain-ai/deepagents
