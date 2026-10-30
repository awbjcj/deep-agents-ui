# Scheduled tasks review — 2026-10-23

Applied the requested code-review, API/interface, frontend engineering, and
Emil design engineering review to the scheduled-task implementation on `dev`.

## Corrections

- Follow manual interrupt resumes even when the answer is false, zero, empty,
  or null. Do not claim completion when cancellation races with an interrupt,
  or a newer prompt prevents verifying the original execution's completion.
- Use one backend response contract for create, list, read, and edit. Validate
  frontend responses before rendering/caching and preserve HTTP error status.
- Add revision-guarded PATCH, bounded task pagination, batched occurrence and
  dispatch queries, schedule-only previews, and retry-safe owned deletion.
  Existing PUT/action paths and full-task preview payloads remain supported.
- Limit preview requests to schedule-field changes. Retry failed chat pages,
  ignore aborted responses, preserve drafts after failed saves, and confirm
  before discarding edited fields.

| Before                                                   | After                                                 | Why                                           |
| -------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Equal-sized cards with repeated labels                   | Compact task rows with schedule and result summaries  | Easier scanning of upcoming work              |
| History opened below the list on small screens           | Focus-managed history dialog                          | Immediate access without losing list position |
| Save buttons scrolled out of view                        | Scrollable form body with fixed action area           | Actions remain reachable at 320px             |
| Native delete confirmation and silent draft loss         | Named delete dialog and unsaved-change prompt         | Clear consequences and draft recovery         |
| Preview refreshed while typing the prompt                | Preview depends only on time, timezone, and frequency | Avoid unnecessary requests and visual resets  |
| Dialog animation overrode the intended keyboard behavior | Immediate task dialogs and focus return               | Predictable keyboard interaction              |
| Low-contrast destructive label                           | Existing semantic error-text token                    | Pass contrast checks in light and dark themes |

## Evidence

- Backend scheduler regression suite: **43 passed**.
- Database migrations and LangGraph auth suites: **34 passed**.
- Real local Agent Server integration: **1 passed**, with an existing
  langchain-community deprecation warning. The graph is deterministic and does
  not call a model provider.
- UI suite: **361 passed**, **47 opt-in tests skipped**.
- Scheduled-task browser fixture: **passed**, including WCAG A/AA axe checks,
  keyboard focus return, dirty drafts, failed saves/chat loads, role restrictions,
  management actions, and layouts at **320 / 768 / 1024 / 1440px**.
- No browser console errors. Production build, ESLint, Ruff, and scoped formatting
  checks passed.

Run the UI build before the opt-in browser test. Install Playwright and axe-core
locally, or point `SCHEDULED_TASKS_PLAYWRIGHT_MODULE` at an installed Playwright
module. Set `SCHEDULED_TASKS_BROWSER_TEST=1` and run:

```powershell
node --import tsx/esm --test tests/scheduled-tasks-browser.test.mjs
```

Screenshots are generated under `test-results/scheduled-tasks/`, including
`tasks-1440.png`, `editor-320.png`, `history.png`, and `tasks-dark.png`.
These are local UI/API fixtures; deployed provider-backed acceptance was not run.
Delivery uses focused backend, frontend, and verification/documentation commits
on each repository's `dev` branch.
