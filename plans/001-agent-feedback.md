# 001 — Make agent feedback accurate

- **Status**: DONE
- **Commit**: `03df9cb` (audit baseline)
- **Severity**: HIGH
- **Category**: Purpose, lifecycle, accessible state indication
- **Estimated scope**: Projection, chat hook, chat status components and regression tests

## Problem

`src/app/hooks/internal/conversationProjection.ts:134` originally folded every tool result into this state:

```ts
status: "completed" as const,
result: extractToolResult(message),
```

Unresolved calls were only `pending` or approval-interrupted. `src/app/components/SubAgentIndicator.tsx:15` displayed a name and chevrons without using the supplied status. `SubAgent.status` excluded `interrupted` even though a cast passed that value through.

## Target

Preserve SDK `status: "error"` as `error`. Unresolved calls are `pending` only in a running current turn; stopped or older-turn calls are `interrupted`. Landed successful results always override the unresolved state. Preserve unchanged message and tool-call object identities.

Share readable Running / Completed / Failed / Interrupted labels with 14px icons. Keep status text visible in reduced motion. Expose `aria-expanded`, stable tool names, and status descriptions on disclosures. A single polite, atomic live region describes only observed phases: Working, Running tool(s), Running agent(s), or Writing response. It is empty when stopped, loading history or awaiting approval; token changes do not remount it.

The active 8px dot uses opacity `.45 → 1 → .45` over `1400ms ease-in-out`; its one-time entrance uses opacity `160ms cubic-bezier(0.23, 1, 0.32, 1)`. Reduced motion keeps a static dot. No timer invents progress.

## Repo conventions to follow

Use `src/app/hooks/internal/conversationProjection.ts` for render projection, `src/app/types/types.ts` for shared types, and memoized chat/tool components. Extend the existing `--ease-out` token in `src/app/globals.css`; do not add dependencies or backend events.

## Steps

1. Pass `stream.isLoading || stream.isThreadLoading` into `useProcessedMessages`; include run state in reconciliation dependencies.
2. Use the latest human-message boundary to prevent unfinished older-turn tools restarting. Map explicit tool errors before folding in result text.
3. Type subagent statuses as `ToolCall["status"] | "active"`; remove the cast hiding interrupted states.
4. Add `RunStatus.tsx`, then use it in tool and subagent headers with accessible text and descriptions. Keep names wrapping within mobile widths.
5. Derive current-turn phase text in `src/lib/agent-activity.ts`; render it through `AgentActivity.tsx` below the transcript, without token-driven keys or layout animation.
6. Add regressions for failure, stop, resume, old-turn calls, stable identities, phase changes and silent terminal/approval states.

## Boundaries

Do not change backend execution, tool permissions, approval submission or result payloads. Do not animate tool-row entrances, readable results, streaming tokens or task reorderings. No fake success or percentage progress.

## Verification

- Mechanical: `node --import tsx/esm --test tests/agent-activity.test.mjs tests/conversation-projection.test.mjs`; `yarn.cmd tsc --noEmit`; scoped ESLint.
- Browser: enable `ANIMATION_REFINEMENTS_BROWSER_TEST=1` and run `node --import tsx/esm --test tests/animation-refinements-browser.test.mjs`. Configure `CHAT_PLAYWRIGHT_MODULE` if Playwright is installed outside this repo.
- Feel check: compare pending → completed/error/interrupted at normal speed and 10% playback; no result text slides or fades. Rapid tokens leave the same live status node mounted. Reduced motion retains visible labels without rotating/pulsing. Inspect at 320px and 1440px.
- Done when terminal work stops spinning, failures never appear successful, phase text changes only with work, and no per-token entrance replays. Verified with isolated browser fixtures.
