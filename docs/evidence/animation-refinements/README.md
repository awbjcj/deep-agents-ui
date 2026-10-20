# Animation refinement evidence

Captured from `tests/animation-refinements-browser.test.mjs` on 2026-10-19. The real chat, Markdown, preview, tooltip and theme components are rendered with mock chat state, a minimal composer, and no live provider or backend calls.

| Screenshot                                         | Scope                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [Desktop light](loop-1440-light-no-preference.png) | Tool completion, active delegation and run feedback at 1440px    |
| [Desktop dark](loop-1440-dark-no-preference.png)   | The same states in dark mode                                     |
| [375px reduced motion](loop-375-dark-reduce.png)   | Static readable status in a narrow dark layout                   |
| [320px light](loop-320-light-no-preference.png)    | Compact controls and wrapped content without horizontal overflow |
| [Preserved preview](preview-preserved.png)         | Open image dialog after an unrelated artifact update             |

Screenshots use `animations: "disabled"`; they document layout and state. Live animation checks run separately in the browser test: instant imperative scroll writes in reduced motion, scroll escape during streaming, instant keyboard activation, continuous status-node identity, image-node identity, preview persistence and code-height stability. Pointer disclosure/theme transitions are `150ms cubic-bezier(0.23, 1, 0.32, 1)`; the status entrance is a 160ms opacity transition. Only the small status dot repeats. Actual device gesture testing and subjective slow-motion review were not performed.

```powershell
$env:ANIMATION_REFINEMENTS_BROWSER_TEST = '1'
# Set CHAT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs if needed.
$env:ANIMATION_REFINEMENTS_EVIDENCE = 'docs/evidence/animation-refinements'
node --import tsx/esm --test tests/animation-refinements-browser.test.mjs
```

Result: five TAP passes, zero failures (four behavior groups and their parent). Existing tool-results and frontend-review browser suites also passed. See [the audit and implementation records](../../../plans/README.md).
