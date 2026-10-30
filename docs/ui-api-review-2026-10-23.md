# UI and API review — 23 October 2026

Reviewed the shared UI controls, workspace layouts, private-skill workflows and the skill HTTP contract across `deep-agents-ui` and `vsda-deep-agent`. Applied `emil-design-eng`, `frontend-ui-engineering` and `api-and-interface-design`.

## UI changes

| Before                                                                                    | After                                                                                                                      | Why                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A global `box-shadow: none !important` rule suppressed form focus rings.                  | Component focus rings remain visible, including the native skill-origin selector.                                          | Keyboard position is visible without relying on subtle border changes.  |
| Every tooltip owned a separate provider and opened immediately.                           | App tooltips share a 400 ms initial delay and 300 ms skip-delay window; subsequent and keyboard tooltips open immediately. | Avoid accidental popups while keeping toolbar exploration fast.         |
| Long tooltips could exceed a narrow viewport.                                             | Tooltip width follows the available viewport width with collision padding and wrapping.                                    | Help stays readable at 320 px.                                          |
| The header could overflow at 320 px with all navigation actions present.                  | The header wraps when needed and keeps the actions aligned to the end.                                                     | Retain every action without horizontal scrolling.                       |
| A mobile-to-desktop resize restored focus to the toolbar while the workspace stayed open. | Preserve focus in the visible panel; return it to its trigger only when it closes.                                         | Keyboard work continues through responsive and expanded layout changes. |

UI motion remains absent for tooltips and keyboard navigation. Standalone tooltip consumers retain a fallback provider. Existing colors, labels, and permission controls remain in place.

## API and interface changes

- **Runtime contract validation:** successful skill responses are parsed through Zod schemas; exported TypeScript types are inferred from those same schemas. Invalid JSON or wrong required field types produce `SkillsApiError` with code `invalid_skill_response` and an instruction to reload the library. Unknown additive fields are accepted. Existing structured errors, revision conflicts and cancellation semantics are retained.
- **Metadata-only catalog reads:** the backend reads metadata and its revision in one account-authenticated transaction without loading the private `files` JSON. Full package reads and the HTTP catalog shape retain their fields, ordering of entries and ownership behavior. No schema migration or shared account cache was added.
- **Accurate OpenAPI errors:** 404, 409, 413, 422 and 503 responses now advertise the existing `detail: {code, message, diagnostics}` envelope. The shared authentication format is unchanged.
- **Uncertain mutation outcomes:** malformed save responses do not discard drafts or claim that the save failed to persist. The error directs the user to reload before continuing.

The regression guard uses a private resource of 420,000 characters and proves that catalog reads never hydrate file bodies. This is evidence of reduced work; no production latency claim is made.

## Verification

- Frontend unit run: 360 passed, 47 opt-in tests skipped.
- Production static build and TypeScript passed.
- Scoped ESLint and Prettier passed; both repositories passed whitespace checks, and backend Ruff passed.
- Backend private-skill unit and API run: 263 passed. After the OpenAPI change, all 13 API integration tests passed, including validation of a real error body against the documented model.
- Browser primitive fixture passed at 320, 768, 1024 and 1440 px in light and dark themes. It checks keyboard focus visibility, delayed initial tooltips, immediate adjacent tooltips, keyboard dismissal, reduced motion, wrapping and overflow.
- Built-app browser suite: 24 passed, 2 unrelated opt-in tests skipped, no failures. This includes malformed-response recovery, draft preservation, responsive panel sizing, and keyboard focus through resize and close.

The built-app suite uses simulated authenticated responses. Its run-list fixture now distinguishes GET inspection from POST submission, and editor checks recognize the existing two-column layout in wide landscape panels. No live provider, deployment, physical touch-device or screen-reader acceptance is claimed.

## Evidence

- [320 px light catalog](evidence/ui-interface-review/catalog-320-light.png)
- [1440 px dark catalog](evidence/ui-interface-review/catalog-1440-dark.png)
- [Narrow tooltip](evidence/ui-interface-review/tooltip-no-preference.png)
- [320 px workspace](evidence/ui-interface-review/workspace-320-light.png)
- [Desktop skill editor, dark theme](evidence/ui-interface-review/editor-desktop-dark.png)
- Built-app screenshots are captured under `%TEMP%/vsda-personal-skills-ui-review`.

The review changes are delivered in focused commits alongside the earlier backend fixes. Concurrent scheduled-task, extraction and documentation work was preserved. In `page.tsx`, this review changes responsive header classes and panel focus management; the scheduled-task delivery also incorporates the header wrapping.

## Documentation checked

- [Radix Tooltip provider, timing and keyboard behavior](https://www.radix-ui.com/primitives/docs/components/tooltip)
- [Zod parsing and object schemas](https://zod.dev/api)
- [FastAPI additional response models](https://fastapi.tiangolo.com/advanced/additional-responses/)
