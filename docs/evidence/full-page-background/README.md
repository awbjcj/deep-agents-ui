# Full-page pattern and floating auth card

The depth field now covers the entire sign-in, registration, and recovery page. The desktop divider and opaque form-panel background are removed, and the artwork is framed for the wider canvas. The form keeps an opaque surface with softer corners and layered shadows to float above the pattern.

| Before                                  | After                                                        | Why                                                          |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Pattern constrained to the brand column | One continuous field across the page                         | Makes the composition feel expansive.                        |
| Flat form card against a separate panel | Elevated card with a defined edge and layered shadows        | Keeps the login block distinct from the surrounding pattern. |
| No card hover feedback                  | An extra shadow fades in over 160ms on precise hover devices | Adds depth while keeping input positions stable.             |

The hover uses an opacity transition on a decorative pseudo-element. It does not move the card or its controls, does not intercept clicks, and is disabled for touch pointers. The existing reduced-motion preference applies.

| View          | Before                                     | After                                    |
| ------------- | ------------------------------------------ | ---------------------------------------- |
| Light desktop | [Before](before/login-light-1440x1000.png) | [After](after/login-light-1440x1000.png) |
| Dark desktop  | [Before](before/login-dark-1440x1000.png)  | [After](after/login-dark-1440x1000.png)  |
| Light hover   | [Before](before/login-light-hover.png)     | [After](after/login-light-hover.png)     |
| Dark hover    | [Before](before/login-dark-hover.png)      | [After](after/login-dark-hover.png)      |
| Mobile        | [Before](before/login-light-390x844.png)   | [After](after/login-light-390x844.png)   |

Validation passed: production build including TypeScript, scoped ESLint and Prettier, `git diff --check`, the existing UI design browser suite on Node 20, and the background capture script. The script captured 22 final views in both themes, checked full-page background coverage at 320–1920px widths, and verified stable hover geometry, touch behavior, reduced motion, keyboard access, and 200% text without horizontal overflow. See [capture checks](after/checks.json).

Reproduce with `DESIGN_EVIDENCE_DIR=docs/evidence/full-page-background`, `DESIGN_PHASE=after`, and `node scripts/capture-background-design.mjs` after building. Set `CHAT_PLAYWRIGHT_MODULE` to an installed Playwright ESM entry when needed. Screenshots use the local production export and mocked service responses.
