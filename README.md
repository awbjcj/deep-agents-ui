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

| Command                             | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `yarn dev`                          | Dev server with Turbopack on `localhost:3000`                |
| `yarn build`                        | Production build (static export when `NEXT_STATIC_EXPORT=1`) |
| `yarn start`                        | Serve a non-export production build                          |
| `yarn lint` / `yarn lint:fix`       | ESLint                                                       |
| `yarn format` / `yarn format:check` | Prettier                                                     |
| `yarn test`                         | Node test runner over `tests/**/*.mjs`                       |

## Browser tests

UI flows have opt-in Playwright suites (`tests/*browser*.test.mjs`). `yarn test`
skips them unless their flag is set, for example:

```bash
TASK_OUTCOME_BROWSER_TEST=1 node --import tsx/esm --test tests/task-outcome-browser.test.mjs
```

Suites that load the full chat serve the static export in `out/`, so run
`yarn build` first. The build can call the agent on the serving origin
(`same-origin`, or unset) or on a separate `NEXT_PUBLIC_DEPLOYMENT_URL`; the
fixtures intercept both.

Install Playwright's Chromium with `yarn playwright install chromium` where
Playwright supports the host. On hosts it doesn't support, such as Ubuntu 20.04,
the suites fall back to the system Google Chrome (`tests/browser-fixtures.mjs`).
Each suite's `*_PLAYWRIGHT_MODULE` and browser executable variables still
override both.

## Configuration

Environment variables (see `.env.example`):

| Variable                        | Required | Description                                                                                   |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_DEPLOYMENT_URL`    | Dev only | LangGraph deployment URL; `same-origin` (or unset in a static export) uses the serving origin |
| `NEXT_PUBLIC_LANGSMITH_API_KEY` | No       | LangSmith key for tracing/deployed graphs                                                     |
| `LANGGRAPH_API_URL`             | No       | Dev-only override for the `/api/*` proxy target                                               |

The assistant ID is selected in the UI and stored in `localStorage`; the JWT from
login is also kept client-side and attached to backend requests.

### Assistant availability

The **Switch agent** button in the header opens the configuration dialog, which
lists only the assistants the signed-in account may use.
**VSDA Deep Agent** is the default supervisor and always stays the legacy
supervisor; it never switches a conversation to the Task Agent, and a
conversation stays with the agent it started in. Two assistants are restricted:

- **VSDA Task Agent**: developer and admin accounts only, and only after an
  administrator enrolls the account on the server (`VSDA_ORCHESTRATION_ROLLOUT`
  and `VSDA_ORCHESTRATION_ALLOWLIST`). It must be chosen explicitly.
- **VSDA Code Analyzer Agent**: developer and admin accounts only. Its SCM
  credential, Copilot credential and Copilot quota panels in **Workspace →
  Tokens** appear only for these accounts.

The UI reads `can_use_task_agent` and `can_use_code_analyzer` from
`GET /api/user/profile` (treated as `false` when an older server omits them)
through `src/lib/agent-access.ts`. Ordinary `user` accounts never see these
assistants, their descriptions, welcome copy or settings panels, and a saved or
bookmarked selection of one falls back to VSDA Deep Agent. The server enforces
the same rules and answers 403 for runs and `/api/code-analysis/*` or
`/api/user/scm/*` requests from accounts without access.

### Deployment profiles

`next.config.ts` selects behavior by build mode:

- **dev** (`next dev`) — talks to `http://localhost:2024`; rewrites proxy `/api/*`.
- **build / deploy** (`NEXT_STATIC_EXPORT=1`) — a **static export** served under
  `basePath: /chat`. An absolute `NEXT_PUBLIC_DEPLOYMENT_URL` is baked in at
  build time (`make deploy` uses `https://agent.vsda.top`); `same-origin`, or no
  value, makes the export call the origin that served it (`make build`, the
  native run, and the desktop app). Static exports ignore rewrites, so there is
  no dev proxy in this mode.

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
    login/, forgot-password/ Auth screens (shared shell in components/auth/)
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

Version tags and GitHub Releases are generated automatically from stable
`main` history after CI passes. See [automated versioning](docs/versioning.md)
for version rules, historical labels, and the release cadence.

- Backend & agent graphs: [`../vsda-deep-agent`](../vsda-deep-agent)
- Upstream project: https://github.com/langchain-ai/deep-agents-ui
- Deep Agents: https://github.com/langchain-ai/deepagents
