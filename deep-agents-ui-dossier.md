---
repo_url: https://github.com/awbjcj/deep-agents-ui
repo_name: deep-agents-ui
role: maintainer
generated_at: 2026-10-02
source_revision: f9087b1951d5b17726a7cc77365e4fc3487bc489
---

# Project: Deep Agents UI — Governed Streaming Agent Console

## Summary

A customized open-source console for users operating an enterprise agent backend. It combines live conversation streaming with authentication, role controls, tool approvals, usage governance, attachments, and workspace inspection. Recent implementation continues runs from the server’s latest checkpoint and overlays pending subagent files until root state catches up. This is active fork-maintenance work; upstream history remains part of the repository.

Role: maintainer (326 of 510 repository commits across the owner’s Git identities, `git shortlog -sne f9087b1951d5b17726a7cc77365e4fc3487bc489`; preserved upstream/contributor and automation history is excluded from the owner count)
Repository: https://github.com/awbjcj/deep-agents-ui
Timeline: 2025-08 – present (`git log --reverse --format=%as`)

## Tech stack (evidence-backed)

- TypeScript — typed hooks, components, and utilities in `src/`.
- React — components and context providers in `src/app/` and `src/providers/`.
- Next.js — App Router and build scripts in `src/app/` and `package.json`.
- LangGraph SDK — stream subscriptions and run submission in `src/app/hooks/useChat.ts`.
- Radix UI — accessible primitives under `src/components/ui/`.
- Tailwind CSS — utility styling in `tailwind.config.mjs` and `src/app/`.
- SWR — usage fetching in `src/app/hooks/useTokenUsage.ts`.
- nuqs — URL-backed thread selection in `src/app/hooks/useChat.ts`.
- Node.js — test runner configured in `package.json` and suites under `tests/`.

## Architecture highlights

- Built concurrent token and state streaming with conversation projection and recovery in `src/app/hooks/useChat.ts` and `src/app/hooks/internal/conversationProjection.ts`.
- Prevented stale-checkpoint branching when continuing a run by submitting from the server’s latest state in `src/app/utils/threadHeadSubmit.ts`; regression coverage in `tests/thread-head-submit.test.mjs`.
- Exposed pending subagent file writes before parent completion, reconciling the overlay against root state in `src/lib/pending-files.ts` and `src/app/hooks/useChat.ts` (`1111645`).
- Bound approve/edit/reject decisions to their original pending interrupt IDs, rejecting expired reviews in `src/app/utils/interruptResume.ts` and `tests/interrupt-resume.test.mjs`.
- Surfaced separate token, call, and estimated-cost usage against configured limits in `src/app/hooks/useTokenUsage.ts` and the usage-management components under `src/app/components/`.
- Integrated authenticated uploads and readable file previews with component-level viewer coverage in `src/lib/uploads.ts`, `src/app/components/FileViewDialog.tsx`, and `tests/file-view-dialog-a11y.test.mjs`.

## Quantified outcomes

- Counted 151 tracked TypeScript source modules, including 98 `.tsx` modules, and 42 `.mjs` test-suite files (`git ls-tree -r --name-only f9087b1951d5b17726a7cc77365e4fc3487bc489 -- src tests`, filtered by suffix).
- Recorded 510 repository commits at source revision `f9087b19` (`git rev-list --count f9087b1951d5b17726a7cc77365e4fc3487bc489`).
- None evidenced for production latency, uptime, business impact, or benchmarked model quality; no such outcome is claimed.

## Skills demonstrated

Languages: TypeScript
Frameworks: React, Next.js, LangGraph SDK
Frontend: Radix UI, Tailwind CSS, SWR, nuqs
Testing: Node.js
