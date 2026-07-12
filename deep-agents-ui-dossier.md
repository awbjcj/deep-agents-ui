---
repo_url: https://github.com/awbjcj/deep-agents-ui
repo_name: deep-agents-ui
role: maintainer of a fork (git: forked from langchain-ai/deep-agents-ui; my identities author the majority of commits and all enterprise-integration features, alongside preserved upstream history)
generated_at: 2026-07-11
---

# Project: Deep Agents UI — Real-Time Agent Chat Console with Governance & Human-in-the-Loop

A Next.js / React operator console that token-streams a LangGraph multi-agent LLM
backend in real time and layers JWT authentication, role governance, and
human-in-the-loop tool approvals onto the open-source `deep-agents-ui`.

## Summary

This is the human-facing surface for an agentic AI assistant: a conversational UI
for chat and thread management that renders live LLM output, sub-agent activity,
tool calls, and file/workspace state as the agent graph executes. It is a
customized fork of `langchain-ai/deep-agents-ui`; on top of the upstream chat
surface I built the enterprise-readiness layer — JWT authentication, three role
tiers (`user` / `developer` / `admin`), per-user model and connectivity
selection, weekly token budgets, an admin panel, human-in-the-loop tool
approvals, image/file attachments, and file/workspace viewers (README + component
tree below). It streams the LangGraph deployment through
`@langchain/langgraph-sdk` using token-level and state-snapshot stream modes, and
authenticates against the project's FastAPI backend. As fork maintainer I hold
the majority of commits and authored the governance and enterprise surfaces; the
project is actively developed (latest commit 2026-06).

## Tech stack (evidence-backed)

- **TypeScript (5.9)** — entire `src/` tree (67 `.ts`/`.tsx` modules).
- **React 19** — `react`/`react-dom` 19.2 (`package.json`); 52 `.tsx` components.
- **Next.js 16 (App Router)** — `src/app/` route tree, `next dev --turbopack` (`package.json`).
- **LangGraph SDK (`@langchain/langgraph-sdk` 1.9.9)** — `useStream` React hook with `messages-tuple` (token-level) + `values` (state-snapshot) stream modes in `src/app/hooks/useChat.ts`; covered by `tests/langgraph-stream-modes.test.mjs`.
- **Human-in-the-loop (HITL)** — LangGraph `interruptBefore`/`interruptAfter` on tool nodes with interrupt-resume flow (`src/app/hooks/useChat.ts`; `ToolApprovalInterrupt.tsx`, `BatchToolApprovalInterrupt.tsx`).
- **Multimodal attachments** — image/file uploads with size + per-send limits (`src/app/hooks/useAttachments.ts`, `src/lib/uploads.ts`).
- **React Context providers** — 6 providers in `src/providers/` (Auth, Chat, Client, Connectivity, Notifications, Theme).
- **Radix UI** — accessible primitives (dialog, select, tabs, tooltip, switch, scroll-area) wrapped in `src/components/ui/`.
- **Tailwind CSS 3** — utility styling + `tailwind-merge`, `class-variance-authority`, `tailwindcss-animate`.
- **nuqs** — type-safe URL search-param state; **SWR** — client data fetching/caching.
- **react-markdown + remark-gfm + KaTeX** — markdown/math LLM-output rendering (`src/app/components/MarkdownContent.tsx`, `rehype-katex`).
- **Zod 4** — runtime schema validation.
- **JWT auth client** — `src/lib/auth.ts`, `src/providers/AuthProvider.tsx`.
- **ESLint + Prettier** (lint/format), **Yarn 1.x** (packaging), **Node test runner + tsx/esm** (`node --test tests/**/*.mjs`).

## Architecture highlights

- Built a real-time agent-run console that token-streams LLM output while
  simultaneously consuming full state snapshots, subscribing to both
  `messages-tuple` and `values` LangGraph stream modes via `useStream`
  (`src/app/hooks/useChat.ts`) and projecting the raw event stream into
  renderable conversation state in
  `src/app/hooks/internal/conversationProjection.ts` (unit-tested in
  `tests/conversation-projection.test.mjs`).
- Implemented human-in-the-loop tool approval end-to-end in the UI, wiring
  LangGraph `interruptBefore`/`interruptAfter` tool gates to approve/edit/reject
  controls for single and batched tool calls
  (`src/app/components/ToolApprovalInterrupt.tsx`, `BatchToolApprovalInterrupt.tsx`)
  and resuming the run with the operator's decision.
- Engineered a JWT auth + role-governance layer on top of the upstream chat fork:
  `src/providers/AuthProvider.tsx` + `src/lib/auth.ts` drive login/recovery flows
  and gate `user`/`developer`/`admin` surfaces including `AdminPanel.tsx` and
  `UserManagementSidebar.tsx`.
- Built per-user multi-provider model + connectivity governance UIs
  (`ModelSelector.tsx`, `ModelSidebar.tsx`, `ConnectivitySidebar.tsx` with a
  `ConnectivityProvider`) so each user's model/effort selection and service
  connectivity are configured in-app and validated against backend tiers.
- Added multimodal chat input — image/file attachment upload with client-side
  size and per-send limits (`src/app/hooks/useAttachments.ts`, `src/lib/uploads.ts`,
  `AttachmentChip.tsx`, `AttachmentsRow.tsx`).
- Implemented weekly token-budget visibility via a dedicated
  `TokenManagementSidebar.tsx` + `useTokenUsage.ts` hook, surfacing live LLM
  consumption against each user's budget.
- Designed a guided credential-onboarding flow (`TokenSetupWizard.tsx`,
  `tokenSetupGuides.tsx`, `tokenServiceGuides.ts`) walking users through per-service
  token setup for the enterprise integrations.
- Modeled chat and thread management as focused hooks (`useChat.ts`,
  `useThreads.ts`, `useAttachments.ts`, `useNotifications.ts`), keeping data
  concerns out of the `ChatInterface`/`ThreadList` view components.
- Added an accessible file/workspace inspection surface (`WorkspacePanel.tsx`,
  `FileViewDialog.tsx`, `TasksFilesSidebar.tsx`), with dialog accessibility guarded
  by `tests/file-view-dialog-a11y.test.mjs`.

## Quantified outcomes

- 52 React `.tsx` components across the app (`find src -name '*.tsx' | wc -l`).
- ~15,331 lines of TypeScript across 67 modules (`find src \( -name '*.ts' -o
  -name '*.tsx' \) | wc -l`; fork total including preserved upstream code).
- 6 React Context providers composing app-wide state (`ls src/providers`).
- 2 LangGraph stream modes consumed concurrently (`messages-tuple` token
  streaming + `values` state snapshots) in `src/app/hooks/useChat.ts`.
- 3 role tiers (`user`/`developer`/`admin`) gated in the UI.
- 4 test suites / 12 test cases covering stream-mode parsing, conversation
  projection, markdown rendering, and dialog accessibility (`tests/*.mjs`).
- 398 commits in the fork's history; latest 2026-06-16 (`git rev-list --count
  HEAD`; `git log`).
- None evidenced for rendering performance, bundle size, or Core Web Vitals — no
  Lighthouse or bundle-analysis artifact is checked in; omitted rather than estimated.

## Skills demonstrated

- **Languages:** TypeScript, JavaScript (JS)
- **Frameworks:** React 19, Next.js 16 (App Router), React Context, React hooks
- **AI / LLM integration:** LangGraph SDK (`@langchain/langgraph-sdk`), agentic AI chat UI, real-time token streaming, streaming state projection, human-in-the-loop (HITL) approval UX, multimodal (image/file) input, per-user LLM model/token governance
- **UI / Styling:** Radix UI, Tailwind CSS, class-variance-authority, accessible component design (WAI-ARIA dialogs), theming (light/dark)
- **State & Data:** SWR, nuqs (URL state), Zod validation, react-markdown + KaTeX rendering
- **Auth & Governance:** JWT authentication, role-based access control (RBAC) UI, admin tooling, credential-onboarding flows
- **Testing:** Node test runner, tsx/esm, accessibility testing
- **Tooling:** ESLint, Prettier, Yarn, Turbopack
- **Architecture:** open-source fork maintenance, provider/hook separation of concerns, component-driven design
