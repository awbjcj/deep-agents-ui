# 003 — Restrain shared control motion

- **Status**: DONE
- **Commit**: `03df9cb` (audit baseline)
- **Severity**: MEDIUM
- **Category**: Performance, purpose/frequency, keyboard interaction
- **Estimated scope**: ThemeToggle, TooltipContent, tool/subagent disclosures

## Problem

`src/app/components/ThemeToggle.tsx:31` originally used:

```tsx
"transition-all duration-300 ease-in-out";
isDark ? "left-[calc(100%-32px)] ..." : "left-1 ...";
```

This animated layout on a persistent control. `src/components/ui/tooltip.tsx:57` replayed a 150ms fade/zoom/slide on every reveal, including keyboard focus. Disclosure chevrons were replaced rather than retained between states.

## Target

Theme thumb: constant `left: 0.25rem`, vertical centering retained, `translateX(0) ↔ translateX(1.75rem)` via Tailwind `translate-x-0` / `translate-x-7`; only transform transitions, `150ms cubic-bezier(0.23, 1, 0.32, 1)`. Tool/subagent chevrons retain one element and rotate `0deg ↔ 180deg` with the same transition.

Each control records click modality using `event.detail > 0`. A `data-motion="instant"` variant sets `transition-property: none` for keyboard/assistive activation; the existing reduced-motion policy remains in force. CSS transitions retarget rapid pointer reversals instead of restarting keyframes. Shared tooltips appear immediately for both keyboard and repeated pointer use, retaining Radix positioning and accessible content.

## Repo conventions to follow

Reuse `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, existing Tailwind utilities, named group variants, and current Radix Tooltip structure. Do not add a motion library. Keep press, focus-ring and disabled styles intact.

## Steps

1. Fix the theme thumb's left position; replace `transition-all` with `transition-transform duration-150 [transition-timing-function:var(--ease-out)]`.
2. Set each control's `data-motion` from click modality. Apply `group-data-[motion=instant]/<group>:transition-none` to its moving child. Retain reduced-motion handling.
3. Keep one disclosure chevron and vary only its rotation. Leave disclosure bodies and height immediate.
4. Remove shared tooltip entrance/exit motion classes; preserve its origin token, placement, arrow, portal and text styling.

## Boundaries

No theme-wide crossfade, hover movement, keyboard delay, focus jump, tooltip provider timing redesign, dialog/select changes or account-menu rewrite. Existing modal origins and reduced-motion choices are deliberate and remain intact.

## Verification

- Browser: `ANIMATION_REFINEMENTS_BROWSER_TEST=1` with `node --import tsx/esm --test tests/animation-refinements-browser.test.mjs` verifies keyboard immediacy, fixed left geometry, transform-only pointer motion and instant focus tooltips.
- Existing shields: enable `FRONTEND_REVIEW_BROWSER_TEST=1` and `TOOL_RESULTS_BROWSER_TEST=1`, then run their respective browser files. Both passed.
- Feel check: reverse pointer toggles rapidly at 10% playback; the thumb/chevron retargets without a restart or layout shift. Activate the same controls with Enter after pointer use; no movement should be tweened. Reduced motion stays immediate and readable.
- Done when layout coordinates stay fixed, only intended transform changes animate, and repeated/keyboard tooltip access has no entrance delay. Verified with rendered Chromium fixtures.
