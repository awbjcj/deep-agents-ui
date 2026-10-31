# Deep Agent background redesign

The shared sign-in, registration, and password recovery shell now uses an expansive depth field. Contours move toward an offset vanishing point; branching paths and small collection points suggest delegation and gathering knowledge. Mineral slate in light mode and green-black in dark mode retain the Aptiv palette while giving the surface more depth.

The artwork is still. A mask leaves the main reading area quiet, and the form card remains opaque. On compact screens the same field continues around the form instead of disappearing with the desktop brand column.

| Before                                                        | After                                                                  | Why                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Repeated 24px dot grid                                        | Continuous contours extending beyond the panel edges                   | Creates space and depth without a tiled texture.                                 |
| Small orthogonal wiring diagram                               | Branching paths and sparse collection points converging into the field | Connects the visual identity to delegation, gathering, and deeper investigation. |
| Drawing animation and pulsing approval marker                 | Static SVG decoration                                                  | Avoids distracting motion or implying live task status on a sign-in screen.      |
| Pattern absent on mobile                                      | Subtle field around the opaque form                                    | Keeps the visual identity consistent across widths.                              |
| 420ms entrance                                                | 240ms entrance using the existing ease-out curve                       | Makes initial presentation more immediate.                                       |
| Fixed-height submit button clips a wrapped label at 200% text | Minimum height and vertical padding allow the button to grow           | Keeps registration and recovery actions readable with enlarged text.             |

Primary comparisons use the same viewport and 1x pixels:

| View                    | Before                                       | After                                       |
| ----------------------- | -------------------------------------------- | ------------------------------------------- |
| Dark, 1440 × 1000       | [Original](before/login-dark-1440x1000.png)  | [Redesign](after/login-dark-1440x1000.png)  |
| Light, 1440 × 1000      | [Original](before/login-light-1440x1000.png) | [Redesign](after/login-light-1440x1000.png) |
| Mobile light, 390 × 844 | [Original](before/login-light-390x844.png)   | [Redesign](after/login-light-390x844.png)   |
| Mobile dark, 390 × 844  | [Original](before/login-dark-390x844.png)    | [Redesign](after/login-dark-390x844.png)    |
| Password recovery, dark | [Original](before/recovery-dark.png)         | [Redesign](after/recovery-dark.png)         |

Additional captures cover 320, 768, 1024, and 1920px widths, a 5000px tall raw capture, and [200% text on registration](after/registration-dark-200-percent-text.png). Original captures were taken before editing the auth implementation. Final captures fast-forward finite entry animations to avoid capturing transitional text during full-page viewport resizing.

`DepthField.tsx` computes deterministic geometry once outside the component and reuses a static SVG tree. It adds no dependency, state, effect, event listener, canvas, or animation loop. Cubic curves keep the SVG markup near 30KB. Theme styling stays in CSS, so the existing pre-hydration theme setup still applies. The decorative layer is hidden from accessibility APIs, contains no focusable elements, and ignores pointer events. This follows React's guidance on [pure rendering](https://react.dev/reference/rules/components-and-hooks-must-be-pure) and [avoiding unnecessary effects](https://react.dev/learn/you-might-not-need-an-effect).

Validation:

- `yarn build`: passed, including TypeScript and static export.
- `yarn test`: 403 passed, 59 opt-in tests skipped, zero failed.
- Scoped ESLint, Prettier, and `git diff --check`: passed.
- Existing `ui-design-review-browser.test.mjs`: passed with the repository's Node 20 runtime. This covers keyboard focus, tooltips, and narrow layouts using compiled app CSS.
- `scripts/capture-background-design.mjs`: captures both themes and checks horizontal overflow, form visibility, theme switching, keyboard password reveal, registration, 200% text, and decoration accessibility. The final capture asserts that wrapped submit text fits inside its button. See [machine-readable checks](after/checks.json).

To repeat after building, point `CHAT_PLAYWRIGHT_MODULE` at an installed Playwright ESM entry if Playwright is not locally installed, set `DESIGN_PHASE=after`, then run `node scripts/capture-background-design.mjs`. Use Node 20 with `--import tsx/esm` when running the existing component browser suite.

The screenshots use the production export with local service fixtures and no live accounts. They establish local rendering and interaction behavior; this change has not been deployed.
