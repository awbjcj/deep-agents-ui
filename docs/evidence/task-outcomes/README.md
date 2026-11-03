# Task completion verification UI

Rendered Chromium fixtures for task completion verification:

- `completed.png`, `unverified.png`, `blocked.png`, `needs_input.png`,
  `budget_exhausted.png`: the built chat restoring each terminal status from
  the checkpoint after a refresh, with the backend's fallback notice replaced
  and the answer preserved (`tests/task-outcome-browser.test.mjs`).
- `expanded-1280-light.png`, `expanded-390-light.png`,
  `expanded-1280-dark.png`: the completion-check card with per-check detail,
  the grader revision card and a persisted status notice
  (`tests/task-outcome-cards-browser.test.mjs`).

Reproduce from a production build (`yarn build`), which serves the static export
the integration suite loads:

```bash
yarn build
TASK_OUTCOME_BROWSER_TEST=1 node --import tsx/esm --test \
  tests/task-outcome-browser.test.mjs tests/task-outcome-cards-browser.test.mjs
```

Browser setup is described under "Browser tests" in the repository README.
Fixture evidence is distinct from live-provider acceptance.
