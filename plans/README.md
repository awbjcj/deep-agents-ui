# UI motion and rendering review

Audited from UI commit `03df9cb` on 2026-10-19. The requested improvements are implemented in the companion `deep-agents-ui` checkout. The backend agent runtime was not changed.

## Recon

Next.js 16 / React 19, Tailwind 3, Radix UI and CSS animations. No animation library or dependency was added. The existing entrance curve is `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. The existing global reduced-motion policy deliberately removes movement; this policy is preserved, including for new feedback. Text labels make running and terminal states readable without animation.

This is a working chat interface. Tokens, tool loops, task rows and keyboard actions recur frequently. Dialogs and deliberate detail inspection are occasional. New motion is limited to an unobtrusive running dot and pointer-triggered disclosure feedback; readable content stays still.

## Confirmed findings

Locations identify the implemented scope; the finding describes behavior at the audit commit.

| #   | Severity | Category                | Location                                                                               | Finding                                                                                                           | Result                                                                                                                                      |
| --- | -------- | ----------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HIGH     | Accessibility           | `src/app/components/ChatInterface.tsx:88`                                              | Default imperative spring scrolling bypassed the CSS reduced-motion policy.                                       | Initial positioning is instant; reduced-motion streaming and keyboard jumps are instant; live preference changes cancel an existing spring. |
| 2   | HIGH     | State indication        | `src/app/hooks/internal/conversationProjection.ts:141`                                 | Every tool result appeared completed, including explicit SDK error results.                                       | Explicit errors remain failed; successful or legacy unmarked results remain completed.                                                      |
| 3   | HIGH     | Purpose / lifecycle     | `src/app/hooks/internal/conversationProjection.ts:121`, `src/app/hooks/useChat.ts:730` | Calls without results could keep spinning after a run stopped, or restart spinning in a later turn.               | Run lifecycle and current-turn boundaries terminate unresolved indicators; resume can make the same current-turn call pending again.        |
| 4   | MEDIUM   | Content stability       | `src/app/components/MarkdownContent.tsx:666`                                           | A files-map update changed renderer component types, remounting images and closing their previews.                | Stable renderers consume file data through context. Unrelated artifact updates preserve elements, loaded state and open dialogs.            |
| 5   | MEDIUM   | Content stability       | `src/app/components/MarkdownContent.tsx:108`                                           | Lazy code initially scrolled horizontally, then wrapped after highlighting arrived. Font sizes also differed.     | Fallback and highlighted code share metrics and wrapping. Plain and oversized code retains horizontal scrolling.                            |
| 6   | MEDIUM   | Accessible feedback     | `SubAgentIndicator.tsx:30`, `ToolCallBox.tsx:155`                                      | Delegation status was absent; tool status relied on icons.                                                        | Shared Running / Completed / Failed / Interrupted labels; disclosure state and status descriptions are accessible.                          |
| 7   | MEDIUM   | Performance / frequency | `src/app/components/ThemeToggle.tsx:24`, `src/components/ui/tooltip.tsx:57`            | Theme changes animated `left` via `transition-all`; every tooltip replayed an entrance, including keyboard focus. | Theme thumb uses only transform, with immediate keyboard activation. Tooltips appear immediately.                                           |

## Opportunities and gate decisions

| #   | Location                                   | Before                                                                       | Purpose          | Frequency                           | Implemented motion                                                                                                                                                                                                                         |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `AgentActivity.tsx`, `globals.css:805`     | Quiet gaps between message and tool events had no persistent phase feedback. | State indication | Tens of runs/day; small status only | One mounted status node: opacity entrance `160ms cubic-bezier(0.23, 1, 0.32, 1)` via `@starting-style`. Only the 8px dot repeats `opacity .45 → 1 → .45`, `1400ms ease-in-out`. No position change; reduced motion is static text and dot. |
| 2   | `ToolCallBox.tsx`, `SubAgentIndicator.tsx` | Disclosure chevrons were replaced instead of transitioning between states.   | State indication | Occasional deliberate inspection    | One chevron rotates `0deg ↔ 180deg`, `150ms cubic-bezier(0.23, 1, 0.32, 1)`. CSS transitions retarget rapidly. `event.detail === 0` and reduced motion disable this transition. Text and panel height never animate.                       |

Both pass the speed and function gates: the one-time transitions stay below 200ms, interaction remains available immediately, and only opacity or transform animates. Neither adds hover movement, so no hover media gate is needed.

One lower-value opportunity remains deferred: `AccountMenu.tsx:84` has inactive `data-state` animation selectors. An occasional pointer-opened menu could use top-right-origin `scale(.97) → scale(1)` and `opacity 0 → 1`, `150ms cubic-bezier(0.23, 1, 0.32, 1)`, with an opacity-only reduced-motion variant and immediate keyboard opening. It passes frequency, spatial-consistency, speed and function gates, but needs a separate presence/focus pass for a symmetric exit. No incomplete menu animation was added here.

## Rejected candidates

- `ChatMessage.tsx` / `MarkdownContent.tsx` token, paragraph or word entrances: rejected by frequency and function. Streaming prose is for reading, not repeated reveals.
- `ChatMessage.tsx` tool-row staggering: rejected by frequency. Agent loops repeat throughout a run.
- `ChatInterface.tsx` task regrouping: rejected by function. Moving operational rows would move the user's reading targets.
- `MarkdownContent.tsx` table-row animation: rejected by function. Tables remain stable and directly actionable.
- `ChatComposer.tsx` Send/Stop morphs: rejected by keyboard/frequency. Core actions remain immediate.

Shared dialog and select entrances already use the existing curve, suitable durations and appropriate origins. Their deliberate reduced-motion policy was retained. The unused Tailwind `hide` easing token was not reported as an active defect. There is no new drag interaction requiring physics.

## Implementation records

| Order | Plan                                                              | Severity | Status | Dependencies                                  |
| ----- | ----------------------------------------------------------------- | -------- | ------ | --------------------------------------------- |
| 1     | [001 — Make agent feedback accurate](001-agent-feedback.md)       | HIGH     | DONE   | None                                          |
| 2     | [002 — Preserve reading and preview state](002-stable-content.md) | HIGH     | DONE   | None; verify with 001's chat shell            |
| 3     | [003 — Restrain shared control motion](003-shared-motion.md)      | MEDIUM   | DONE   | Reuses 001's pointer/keyboard disclosure rule |

## Verification

- `yarn.cmd test`: **336 passed**, **29 opt-in browser skips**, no failures.
- Enabled `tests/animation-refinements-browser.test.mjs`: **5 TAP passes** (four behavior groups plus their parent), no failures.
- Enabled existing `tests/tool-results-browser.test.mjs` and `tests/frontend-review-browser.test.mjs`: **2 passed**, no failures.
- TypeScript, scoped ESLint, Prettier and production static build passed. No dependency or environment migration.
- [Screenshots and browser scope](../docs/evidence/animation-refinements/README.md) cover 320px, 375px and 1440px, light/dark themes, and reduced motion. These are isolated component fixtures with chat services mocked, not live provider or deployed-backend acceptance.

## Verdict

This interface benefits from a little state feedback and less repeated motion. The highest-leverage improvement is preserving the reader's position and component state while the agent works. The selected changes are implemented; a future optional menu pass can start with `improve-animations plan AccountMenu pointer-origin presence and symmetric dismissal`.
