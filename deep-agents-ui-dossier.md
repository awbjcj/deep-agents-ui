---
repo_url: https://github.com/awbjcj/deep-agents-ui
repo_name: deep-agents-ui
role: maintainer of a fork (git: forked from langchain-ai/deep-agents-ui; my identities author the majority of commits and all enterprise-integration features, alongside preserved upstream history)
generated_at: 2026-07-11
---

# Project: Deep Agents UI — Agent Chat & Governance Frontend

A Next.js (App Router) / React chat frontend that streams a LangGraph multi-agent
backend in real time and adds an authentication, role-governance, and
human-in-the-loop approval layer on top of the open-source `deep-agents-ui`.

## Summary

This is the operator-facing surface for a multi-agent engineering-data assistant:
a conversational UI for chat and thread management that renders live agent output,
sub-agent activity, tool calls, and file/workspace state as the graph runs. It is
a customized fork of `langchain-ai/deep-agents-ui`; on top of the upstream chat
surface I added the enterprise-readiness layer — JWT authentication, three role
tiers (`user` / `developer` / `admin`), per-user model and connectivity
selection, weekly token budgets, an admin panel, human-in-the-loop tool
approvals, and file/workspace viewers (README; component tree below). It connects
to the LangGraph deployment through `@langchain/langgraph-sdk` and authenticates
against the project's FastAPI backend. As fork maintainer I hold the majority of
commits and authored these governance surfaces; the project is actively developed
(latest commit 2026-06).

## Tech stack (evidence-backed)

- **TypeScript (5.9)** — entire `src/` tree (67 `.ts`/`.tsx` modules).
- **React 19** — `react`/`react-dom` 19.2 (`package.json`); 52 `.tsx` components.
- **Next.js 16 (App Router)** — `src/app/` route tree, `next dev --turbopack` (`package.json`).
- **LangGraph SDK (`@langchain/langgraph-sdk` 1.9.9)** — real-time run streaming; stream-mode handling covered by `tests/langgraph-stream-modes.test.mjs`.
- **React Context providers** — 6 providers in `src/providers/` (Auth, Chat, Client, Connectivity, Notifications, Theme).
- **Radix UI** — accessible primitives (dialog, select, tabs, tooltip, switch, scroll-area) wrapped in `src/components/ui/`.
- **Tailwind CSS 3** — utility styling + `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate` (`package.json`).
- **nuqs** — type-safe URL search-param state (`package.json`).
- **SWR** — client data fetching/caching (`package.json`).
- **react-markdown + remark-gfm + KaTeX** — markdown/math message rendering (`src/app/components/MarkdownContent.tsx`, `rehype-katex`).
- **Zod 4** — runtime schema validation (`package.json`).
- **JWT auth client** — `src/lib/auth.ts`, `src/providers/AuthProvider.tsx`.
- **ESLint + Prettier** — lint/format toolchain; **Yarn 1.x** — package manager (`package.json`).
- **Node test runner (tsx/esm)** — `node --test tests/**/*.mjs`.

## Architecture highlights

- Built a real-time agent-run UI that streams supervisor + sub-agent output as
  the graph executes, projecting the raw event stream into renderable
  conversation state in `src/app/hooks/internal/conversationProjection.ts` (unit-
  tested in `tests/conversation-projection.test.mjs`) and surfacing sub-agent
  activity via `src/app/components/SubAgentIndicator.tsx`.
- Implemented human-in-the-loop tool approval in the UI, rendering interrupt
  payloads as approve/edit/reject controls for single and batched tool calls
  (`src/app/components/ToolApprovalInterrupt.tsx`,
  `BatchToolApprovalInterrupt.tsx`) so mutating agent actions require an operator
  decision.
- Engineered a JWT auth + role-governance layer on top of the upstream chat fork:
  `src/providers/AuthProvider.tsx` + `src/lib/auth.ts` drive login/forgot-password
  flows and gate `user`/`developer`/`admin` surfaces including
  `AdminPanel.tsx` and `UserManagementSidebar.tsx`.
- Built per-user model and connectivity governance UIs — `ModelSelector.tsx`,
  `ModelSidebar.tsx`, and `ConnectivitySidebar.tsx` with a
  `ConnectivityProvider` — so each user's model/effort selection and service
  connectivity are configured in-app and validated against backend tiers.
- Implemented weekly token-budget visibility with a dedicated
  `TokenManagementSidebar.tsx` + `useTokenUsage.ts` hook, giving users live
  consumption against their budget.
- Designed a guided credential-onboarding flow (`TokenSetupWizard.tsx`,
  `tokenSetupGuides.tsx`, `tokenServiceGuides.ts`) that walks users through
  per-service token setup for the enterprise integrations.
- Modeled chat and thread management as focused hooks — `useChat.ts`,
  `useThreads.ts`, `useAttachments.ts`, `useNotifications.ts` — keeping data
  concerns out of the `ChatInterface`/`ThreadList` view components.
- Added an accessible file/workspace inspection surface (`WorkspacePanel.tsx`,
  `FileViewDialog.tsx`, `TasksFilesSidebar.tsx`), with dialog accessibility
  guarded by `tests/file-view-dialog-a11y.test.mjs`.
- Delivered theme-aware, custom-branded theming with a `ThemeProvider` +
  `ThemeToggle`, replacing the upstream default look.

## Quantified outcomes

- 52 React `.tsx` components across the app (`find src -name '*.tsx' | wc -l`).
- ~15,331 lines of TypeScript across 67 modules (`find src -name '*.ts' -o -name
  '*.tsx' | wc -l`; fork total including preserved upstream code).
- 6 React Context providers composing app-wide state (`ls src/providers`).
- 4 test suites / 12 test cases covering stream-mode parsing, conversation
  projection, markdown rendering, and dialog accessibility (`tests/*.mjs`).
- 398 commits in the fork's history; latest 2026-06-16 (`git rev-list --count
  HEAD`; `git log`).
- None evidenced for rendering performance or bundle size — no Lighthouse or
  bundle-analysis artifact is checked in; omitted rather than estimated.

## Skills demonstrated

- **Languages:** TypeScript, JavaScript (JS)
- **Frameworks:** React 19, Next.js 16 (App Router), React Context, React hooks
- **Agent / LLM integration:** LangGraph SDK (`@langchain/langgraph-sdk`), real-time run streaming, human-in-the-loop (HITL) approval UX, streaming event projection
- **UI / Styling:** Radix UI, Tailwind CSS, class-variance-authority, accessible component design (WAI-ARIA dialogs), theming
- **State & Data:** SWR, nuqs (URL state), Zod validation, react-markdown + KaTeX rendering
- **Auth & Governance:** JWT authentication, role-based access control (RBAC) UI, per-user model/token governance, admin tooling
- **Testing:** Node test runner, tsx/esm, accessibility testing
- **Tooling:** ESLint, Prettier, Yarn, Turbopack
- **Architecture:** open-source fork maintenance, provider/hook separation of concerns, component-driven design
