# Frontend review — October 8, 2026

Reviewed React state/effect behavior in the model and connectivity settings,
chat task status, credential focus scrolling, and shared overlay motion.

## Fixed findings

| Priority | Finding                                                                                    | Change                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2       | Failed model autosaves reset `isSaving`, scheduling the same failing request indefinitely. | Remember the failed draft; retry after an edit or explicit Save. Report failures and declare the callback dependency.                                              |
| P2       | Connectivity responses replace unsaved proxy text and newer mode selections.               | Reconcile only submitted fields that have not changed during the request; apply the same protection to Reset. Keep the Save label while any draft remains unsaved. |
| P2       | Reselecting a previously failed connection mode can remain blocked by its autosave guard.  | Clear the attempt guard on a new selection; still avoid background retry loops.                                                                                    |
| P2       | A task list with no pending tasks is marked complete even when tasks are in progress.      | Require every task to be in the completed bucket.                                                                                                                  |
| P2       | Tooltip origin syntax is incompatible with the installed Tailwind version.                 | Use a supported CSS-variable origin and verify its computed value in Chromium.                                                                                     |
| P2       | Credential focus always requests smooth scrolling despite reduced motion.                  | Respect the media preference and prevent focus from issuing another scroll.                                                                                        |

## Motion and code refinement

- Shared dialog, select, and tooltip entrances use a common strong ease-out token with 150–200 ms durations.
- The composer transitions only its border and shadow, avoiding incidental layout transitions.
- Model and connectivity choices use color feedback without hover displacement.
- Slider hover scaling is limited to enabled controls on precise hover devices with motion enabled.
- The model quota fill uses a transform rather than animating layout width.
- Existing reduced-motion safeguards remain; select and tooltip animation opt-outs are explicit.

## Verification

- `yarn test`: 270 passed; 13 existing opt-in browser tests skipped at the initial suite run.
- `yarn tsc --noEmit`: passed.
- ESLint and Prettier checks on changed files: passed.
- `yarn build`: passed.
- New opt-in `tests/frontend-review-browser.test.mjs`: passed using real React components in Strict Mode, mocked service responses, and compiled application CSS.

Run the browser regression with `FRONTEND_REVIEW_BROWSER_TEST=1` and
`node --import tsx/esm --test tests/frontend-review-browser.test.mjs`.
Set `CHAT_PLAYWRIGHT_MODULE` to an installed Playwright module when it is not
available in this repository. `FRONTEND_REVIEW_EVIDENCE` optionally selects the
screenshot directory.

Browser scenarios cover failed autosave suppression, explicit retry, a new edit,
slow connectivity responses, proxy edits during both mode-only and manual saves,
mode reselection after failure, task completion, and ordinary/reduced-motion
dialog, tooltip, and select behavior. Screenshots show isolated components with
fixture data; they are not evidence of a live backend integration test.

## Remaining polish opportunities

The account menu still has inactive state-based animation classes on a
conditionally mounted element. Admin usage meters still animate width. The
global reduced-motion rule also suppresses gentle color feedback. These are
lower-priority follow-ups outside the state fixes and shared overlays changed
here; this review does not claim an exhaustive frontend or accessibility audit.
