# Final review fix wave: F1 and F2

Base: `5925cdd3567b769edd780f7ca6083429881c57f0` in `D:/Fun/deep-agents-ui/.worktrees/agent-tool-permissions`.

Implemented the complete two-finding wave from the backend final-review report. Product changes are limited to `ToolPermissionsSidebar.tsx` and `admin/ToolPermissionsSection.tsx`; substantive rendered regressions are in `tests/tool-permissions-browser.test.mjs`. No backend, API, dependency, layout, or design change. No push or merge.

## Changes

- F1: Both generic save-error branches invalidate `policyResolved`, invalidate/abort any pending load, and retain existing drafts. The existing Retry button now exposes GET recovery after HTTP 503 and rejected-network PUT failures. Save remains disabled while recovery fails or is pending, then uses the current successfully loaded revision. Aborting an older pending load prevents it from restoring a pre-failure resolved state.
- F2: Administrator conflict review is stored independently in a boolean record for User, Developer, and Admin. A conflict marks only its submitted tier; acknowledgement and successful save clear only that tier. Switching tiers and refreshing saved baselines retain all other review requirements and dirty drafts. The administrator conflict continuation also checks its abort signal after awaiting the reload.
- Existing account-generation checks, request/mutation generations, response-authoritative snapshots, personal review acknowledgement, per-tier drafts, and 8-tab/4-by-2 navigation remain intact.

## Before / After / Why

| Before                                                                                      | After                                                                                                       | Why                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| HTTP 503 or rejected-network save failures immediately reenabled Save and omitted Retry.    | Drafts remain visible; Retry loads current policy; Save stays disabled through failed and pending recovery. | An ambiguous save must recover current server policy before resubmission.            |
| A second tier conflict replaced the first tier's review requirement.                        | Each tier retains its own review gate until specifically acknowledged or saved.                             | Reviewing one tier must not authorize replacing another tier's refreshed values.     |
| Existing rendered coverage tested one outstanding admin conflict and a failed personal GET. | Four PUT-failure recovery cases and a two-tier conflict sequence exercise the actual built panels.          | The regressions cover the reported failures rather than only the shared save helper. |

## Rendered regression evidence

Before changing product code, the new cases ran against the previous production export using:

```powershell
$env:TOOL_PERMISSIONS_BROWSER_TEST='1'
$env:TOOL_PERMISSIONS_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:TOOL_PERMISSIONS_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test --test-name-pattern='rendered save recovery' tests/tool-permissions-browser.test.mjs
```

All five leaf cases failed at the reported gates: four Save-disabled assertions and the first tier's missing review control. Node reported 0 passed, 6 failed including the parent test (`duration_ms 6565.0626`). Full output: `final-fix-red.log` beside this report.

Each of the four final F1 cases (personal/admin crossed with HTTP 503/rejected-network PUT) asserts the exact visible failure, disabled Save, Retry, retained checked draft, a failed recovery GET, a delayed successful recovery GET with Save still disabled, and successful later save using server revision 7. Request counts prove two explicit PUT attempts and two recovery GETs. The personal request asserts both selection and role-qualified tier revisions; the admin request asserts its tier and expected revision.

The F2 case creates User and Developer conflicts without acknowledging either, switches back to User, acknowledges only User, confirms Developer remains blocked, saves User, confirms Developer remains blocked again, then acknowledges and saves Developer. Both retained drafts and expected revision 2 are asserted; both final revisions equal 3.

## Final-code checks

All commands below ran once successfully against the final product/test files. No successful gate was repeated without a relevant change.

| Command                                                                                                                                                           | Result / output                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `yarn test`                                                                                                                                                       | 210 total, **207 passed**, 3 opt-in skips, 0 failed; `duration_ms 3082.1452`. `final-fix-tests.log`.                      |
| `yarn tsc --noEmit`                                                                                                                                               | Passed; `Done in 3.67s.` `final-fix-types.log`.                                                                           |
| `yarn eslint src/app/components/ToolPermissionsSidebar.tsx src/app/components/admin/ToolPermissionsSection.tsx tests/tool-permissions-browser.test.mjs`           | Passed; `Done in 2.45s.`                                                                                                  |
| `yarn prettier --check src/app/components/ToolPermissionsSidebar.tsx src/app/components/admin/ToolPermissionsSection.tsx tests/tool-permissions-browser.test.mjs` | `All matched files use Prettier code style!`                                                                              |
| `git diff --check`                                                                                                                                                | Passed; only the existing LF-to-CRLF notices.                                                                             |
| `node -p 'require("next/package.json").version'`                                                                                                                  | `16.2.11`, matching the locked environment.                                                                               |
| `$env:NEXT_PUBLIC_DEPLOYMENT_URL='http://langgraph.fixture.test'; yarn build`                                                                                     | Passed: compiled successfully, TypeScript completed, 6/6 static pages generated; `Done in 16.60s.` `final-fix-build.log`. |

Using the same TOOL_PERMISSIONS environment shown above:

```powershell
node --import tsx/esm --test tests/tool-permissions-browser.test.mjs
```

Result: **7 passed, 0 failed, 0 skipped** (`duration_ms 16938.02`). This includes all five new subcases plus their parent and the pre-existing broad regression. Full output: `final-fix-permissions-browser.log`.

```powershell
$env:SOURCE_IMAGE_BROWSER_TEST='1'
$env:SOURCE_IMAGE_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:SOURCE_IMAGE_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test tests/source-image-browser.test.mjs
```

Result: **1 passed, 0 failed, 0 skipped** (`duration_ms 17888.2268`). Full output: `final-fix-source-browser.log`. Both enabled fixtures served the newly built static export and used only synthetic accounts and mocked services. Assertions retain the account-switch, focus-refresh, saved/effective, keyboard, narrow-layout, theme, relocated-control, and all-destination checks. The new cases assert no page errors and only diagnostics caused by their injected 503/network/409 failures.

## Self-review and screenshots

Reviewed the complete scoped diff. Generic failure paths execute only after the existing current-account/abort guards; they do not alter stored selections or review acknowledgement state. Reload failure leaves policy unresolved, while successful recovery updates the baseline without discarding dirty drafts. Admin review updates use functional state setters and the save closure's submitted tier, so another tier's outstanding requirement is preserved. The original personal lifecycle regression and both original single-conflict focus-refresh checks passed unchanged.

The fixtures regenerated three previously tracked screenshots. Visually compared each against its committed predecessor: compact Tools has only transient disabled-control rendering differences; Connections retains the same source-policy retry state; Runtime is captured after the existing fixture opens its disclosures, while its committed overview has those disclosures closed. No presentation code or those controls changed. Restored exactly those three regenerated files to preserve the approved screenshots: `admin-runtime-desktop.png`, `admin-tools-compact-desktop.png`, and `connectivity-source-policy-retry.png`. Before copies remain in ignored scratch evidence. Other committed screenshots were unchanged.

No new unresolved risk was identified in this wave. The documented nested-worktree/multiple-lockfile Next warning remains. This evidence concerns the isolated feature pair only: compatibility with the newer backend/UI `dev` branches is not validated, and scoped final re-review remains controller-owned.
