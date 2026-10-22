# Context and Responses UI refinement

The chat details now prioritize incomplete-response guidance, group generated
files with explicit availability, and preview four sources inside a collapsed
disclosure with a keyboard accessible expansion control. Context compaction keeps a short, optional
explanation. Background jobs use status badges and expandable results, with a
fixed dialog heading and footer around the scrolling history.

The screenshots in this directory use mocked conversations and provider jobs;
they do not represent live provider execution.

## Verification

- `yarn test`: 282 passed; 20 opt-in browser cases skipped.
- `yarn build`: production compilation, TypeScript and static export.
- Focused ESLint and Prettier checks on the changed components.
- `RESPONSES_BROWSER_TEST=1 node --import tsx/esm --test tests/responses-browser.test.mjs`:
  source disclosure and expansion by keyboard, long source-title wrapping, unavailable files,
  context disclosure, job loading/action failures and recovery, cancellation,
  deletion, binary downloads, pagination, Escape focus return, phone layout,
  landscape dialog bounds and dark/reduced-motion rendering.

Set `RESPONSES_PLAYWRIGHT_MODULE` to an installed Playwright module URL when
Playwright is supplied by the workspace runtime instead of this repository.

## Screenshots

- [Chat, desktop](chat-desktop.png)
- [Chat, 375 px](chat-mobile.png)
- [Background jobs, desktop](background-jobs-desktop.png)
- [Background jobs, 375 px](background-jobs-mobile.png)
- [Background jobs, dark theme](background-jobs-mobile-dark.png)
- [Historical jobs](background-jobs-history-mobile.png)
