# Personal Skills workspace evidence

Captured on 2026-10-17 from the production static export in Chromium, using authenticated fixtures and mocked Skills endpoints. Every label and private content marker is test data.

- [Desktop workspace in context](desktop-workspace-context-light.png)
- [320px workspace and compact app header](mobile-workspace-context-light.png)
- Matrix filenames: `{1440,320,375,390}-{editor-conflict,conflict,import-error,tabs}-{light,dark}.png`.
- `editor-conflict` shows the retained editor draft and separately loaded latest saved version. `conflict` shows the error announcement and latest-version action. `import-error` shows an invalid preview with Open draft disabled. `tabs` shows keyboard focus on Connections while Skills remains selected until manual activation.

Browser assertions check panel/dialog bounds and horizontal overflow, editor/composer focus, all five labels and order, Home/End/arrow navigation, manual Enter activation, and full visibility of the focused Connections tab at every matrix width. Edge tabs may be partly visible until scrolled; each tab is fully reachable through the scrolling strip. The mobile header keeps Workspace reachable at 320px.

Behavior checks cover explicit create/save/rename/delete, complete manifest-resource copy before staging, import preview and disabled invalid import, 409/503 preservation, successful catalog retry, cancelled/confirmed navigation, account changes and logout with a late response, evidence insertion, thread draft restoration, Append/Cancel, and no chat run until Send. Private draft markers are absent from shared local/session storage; existing auth/config fixture storage remains intact.

Screenshots were visually inspected for readable text, visible focus, usable controls, and horizontal clipping. These are mocked browser integration checks; live backend/runtime validation is separate.

Task 10 reran the production build on 2026-10-17 with `NEXT_STATIC_EXPORT=1`
and `NEXT_PUBLIC_DEPLOYMENT_URL=http://localhost:8000`. `yarn.cmd test` passed
300 tests with 24 opt-in browser skips; `yarn.cmd tsc --noEmit` and
`yarn.cmd build` passed. With both `PERSONAL_SKILLS_BROWSER_TEST=1` and
`TOOL_PERMISSIONS_BROWSER_TEST=1`, the Skills browser module and its imported
tool-permission suites passed all 18 tests with zero skips. The module used the
bundled Playwright runtime and Chromium executable documented in the backend
[verification record](../../../../vsda-deep-agent/docs/agent/personal-skills-verification.md).
Seven editor-conflict images were refreshed; desktop and 320px dark previews
were inspected again. The shared worktree's unrelated Markdown source changes
were preserved and excluded from the feature commits. No live backend/provider,
production restart, or deployment was exercised by this browser suite.
