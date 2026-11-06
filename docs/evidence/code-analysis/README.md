# Code analysis progress verification

These screenshots show the real React components with fixture job responses,
not a production job. Run from the UI repository:

```bash
ANALYSIS_BROWSER_TEST=1 node --import tsx/esm --test tests/code-analysis-progress-browser.test.mjs
```

The browser fixture verifies:

- Progress remains visible while raw tool details are collapsed.
- Preparation shows actual entry counts and elapsed time.
- Model analysis shows its current activity without an invented percentage.
- Transient status failures preserve the last known data and recover.
- Keyboard cancellation stays pending until the worker confirms termination.
- Terminal jobs stop polling.
- Switching jobs ignores an older response still in flight.
- Layouts fit 320, 768, 1024, and 1440 pixels.
- Light/dark themes pass axe WCAG A/AA checks.

`preparing-*.png` show active preparation, `analyzing.png` shows model activity,
and `failed.png` shows an actionable preparation error.

Validation on November 6, 2026: 453 default frontend tests passed; this browser
fixture passed separately; TypeScript, changed-file ESLint, and the Next.js
production build passed.
