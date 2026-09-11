# Task 4 report: compact administrator and workspace information architecture

## Status

Implemented the user-approved eight-destination administrator information architecture and the four-destination Workspace order in the UI worktree. The administrator rail is now exactly **People, Models, Tools, Runtime / Memories, Search, Sources, Newsletters**, with the existing IDs retained as `users`, `tiers`, `tools`, `runmode`, `scopes`, `library`, `scm`, and `newsletters`. The standalone `registration` destination was removed after its complete workflow was composed into People. Workspace is now **Models, Tools, Tokens, Connections**, while retaining `models`, `tools`, `tokens`, and `connectivity` and all existing token deep-link behavior.

The implementation follows the three requested UI skills: it keeps the Aptiv tokens and current component library, uses a four-column grid and the existing spacing rhythm, keeps frequently used controls immediate, and puts advanced or low-frequency forms behind native disclosures with useful counts. It adds no package, font, API, or backend change.

## Before / After / Why

| Before                                                                                                                                           | After                                                                                                                                                                                                                                        | Why                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nine administrator destinations had an uneven final row, with registration separate from account administration.                                 | Eight destinations render as four equal columns per row. Registration policy, code generation, code history, and bulk account operations are compact disclosures inside People.                                                              | The destination map now follows administrator responsibilities and keeps the complete account lifecycle in one place.                                       |
| Run mode also mounted URL overrides, document embeddings, and attachment policy in one long screen; code-analysis resources lived under Sources. | Runtime contains run mode, a collapsed nine-endpoint override form, and collapsed execution resources. Search owns document embeddings. Sources owns attachment policy.                                                                      | Each setting now appears at the destination matching its operational responsibility, and extracted sections fetch only the connectivity contract they need. |
| Model tiers also held source-image policy, while tier-wide usage limits appeared inside the People account directory.                            | Models contains model allowlists and `UsageLimitControls`; Sources contains source-image tier policies in a three-tier disclosure.                                                                                                           | Tier model and quota defaults stay together, while repository and attachment behavior stays under Sources.                                                  |
| The administrator Tools catalog rendered every row on first load.                                                                                | Tools renders the exact 13-entry backend catalog as five native group disclosures with `n of m allowed` summaries and a visible `Draft changed` marker. Personal Tools remains expanded so blocked and pending row state is never concealed. | Administrators can compare tiers quickly without losing saved-versus-draft information or hiding personal enforcement state.                                |
| People with no fixture accounts was dominated by the expanded registration form. SCM configuration was also always expanded.                     | Browser fixtures use two representative accounts. People initially shows the account directory plus labelled bulk and registration disclosures; SCM initially shows a configuration count and expands on demand or when Edit is chosen.      | The initial density is balanced across People, Tools, Runtime, and Sources while every existing action remains reachable.                                   |
| Workspace used Models, Tokens, Connectivity, Tools. Administrator narrow labels depended on very small text.                                     | Workspace uses Models, Tools, Tokens, Connections. Administrator labels remain 11 px, normal case, and normal tracking; two-row icons are hidden consistently below 400 px.                                                                  | The requested order is easier to scan, and 375/390 px labels remain readable and fully bounded inside their tabs.                                           |
| Small blocked, pending, and error text used Aptiv orange/destructive foreground color, which is below 4.5:1 on white for `#f84018`.              | Status and error copy uses the theme foreground color, with orange/destructive retained as border, background tint, and icon accents.                                                                                                        | Functional text remains legible in both themes without changing global brand tokens.                                                                        |
| The newsletter screen opened with a large marketing-style hero.                                                                                  | Newsletters uses the shared restrained section heading and compact draft/sending/delivered summary above the unchanged authoring/history tabs.                                                                                               | The destination matches the compact hierarchy of the other administrator sections without changing send behavior.                                           |

## Implementation details

- `PeopleSection`, `RuntimeSection`, `SearchSection`, and `SourcesSection` compose existing and extracted sections without mode-dependent mounts or duplicated save handlers.
- `EmbeddingProviderSection` and `AttachmentPolicySection` are independently mountable. `UrlOverridesSection` shares only the narrow `useAdminConnectivity` read helper; each mutation retains its original exact payload (`embedding_provider`, `proxy_attachments_enabled`, or changed URL keys only).
- `RunModeSection` retains the saved snapshot, pending selection, keyboard radio behavior, exact run-mode payload, save feedback timer, and teardown cleanup.
- `SourceImagePolicySection` reuses the existing `SourceImageControls` for user, developer, and admin tiers, preserving its saving/error state and backend payloads.
- `ScmServersSection` keeps add, update, edit, delete, validation, token, and enabled-state behavior. Edit opens the native configuration disclosure.
- Tool permission changes are presentation-only. The persistent conflict acknowledgement after focus refresh, account-generation and abort guards around personal saves, and server-effective versus pending row labels from Task 3 remain in place. Admin group summaries compare the current draft to the saved tier snapshot; the personal list remains fully visible.
- `PanelTabs` uses a fixed four-column template for the administrator two-row mode. Browser assertions inspect the tab list, every tab's scroll/client widths, and the actual text and icon rectangles at desktop, 375 px, and 390 px.

## TDD and automated gates

- Focused navigation/density behavior is covered in `tests/admin-panel-density.test.mjs`: exact eight-tab order and IDs, fixed four-column layout, extracted independently mounted sections, collapsed advanced settings, relocation assertions, People composition, and the Workspace order/IDs.
- Full `yarn test`: **209 total, 207 passed, 0 failed, 2 opt-in browser fixtures skipped**.
- `yarn tsc --noEmit`: passed.
- Scoped ESLint over all changed TypeScript, TSX, and browser/unit test paths: passed.
- Scoped Prettier check over the same paths: passed.
- `git diff --check`: passed with no whitespace errors; Git emitted only the worktree's line-ending notices.
- Installed Next.js and the lockfile entry both resolve to **16.2.11**.
- Production build passed with `NEXT_PUBLIC_DEPLOYMENT_URL=http://langgraph.fixture.test`: compiled successfully, TypeScript completed, and 6/6 static pages generated. The only diagnostic is the documented pre-existing multiple-lockfile workspace-root warning for this nested worktree.

Enabled permission regression fixture:

```powershell
$env:TOOL_PERMISSIONS_BROWSER_TEST='1'
$env:TOOL_PERMISSIONS_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:TOOL_PERMISSIONS_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test tests/tool-permissions-browser.test.mjs
```

Result: **1 passed, 0 failed** (`duration_ms 8910.1581`). The fixture still covers all tier and account lifecycle/default/save/conflict regressions from Task 3. It opens compact administrator groups where row interaction is required, verifies Workspace bounds at both 375 px and 390 px, and now switches through the real Theme toggle to assert the blocked badge resolves to theme foreground text rather than `#f84018` and reaches at least 4.5:1 computed contrast in both day and night modes.

Enabled source and all-destinations fixture:

```powershell
$env:SOURCE_IMAGE_BROWSER_TEST='1'
$env:SOURCE_IMAGE_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:SOURCE_IMAGE_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test tests/source-image-browser.test.mjs
```

Result: **1 passed, 0 failed** (`duration_ms 17818.2411`). The fixture serves the production `out/` export and mocks every service mounted by the eight real destinations. It uses the exact 13-entry backend catalog and representative admin/developer accounts; navigates all eight tabs; proves manual arrow focus does not activate until Enter; locates every relocated section; exercises the exact embedding and attachment update bodies; verifies registration, bulk-account, SCM, runtime, and source-image disclosures; and preserves the original source-image success, error, retry, keyboard, attachment-preview, and connectivity regressions. The untouched `003e7bf` baseline source-image fixture also passed 1/1 before relocation.

## Browser evidence and visual inspection

- `docs/evidence/source-images/admin-people-desktop.png` — two representative accounts, per-account usage/actions, and collapsed bulk and registration workflows.
- `docs/evidence/source-images/admin-runtime-desktop.png` — immediate run-mode control with provider endpoints and execution resources summarized on demand.
- `docs/evidence/source-images/admin-sources-overview-desktop.png` — compact SCM configuration, attachment policy, and source-image tier summary.
- `docs/evidence/source-images/admin-tools-compact-desktop.png` — Developer tier with all 13 frozen bootstrap tools represented across five accurate group counts.
- `docs/evidence/source-images/admin-tools-dark-reduced-motion.png` — the same Developer view after using the real **Switch to night mode** control with reduced motion emulated; the fixture asserts `html[data-theme=dark]`, the `dark` class, and a non-white computed body background before capture.
- `docs/evidence/source-images/admin-source-controls-narrow.png` — all eight labels visible at narrow width with source-image controls, error state, and retry information retained.
- `docs/evidence/tool-permissions/personal-tools-blocked-desktop.png` — readable blocked status remains visible in the expanded personal list.
- `docs/evidence/tool-permissions/personal-tools-narrow.png` — all four Workspace labels visible with expanded saved/effective tool status.

Visual inspection compared the provided baseline Admin Tools, Workspace Tools, and source-policy captures with the final desktop, 375/390 px, day, dark, and reduced-motion evidence. Text and controls remain inside panel bounds; the narrow administrator rail hides all eight icons consistently and keeps every 11 px label; People, Runtime, Tools, and Sources have comparable useful initial density without padded equal-height content. The narrow source failure toast and personal blocked badge remain visible and legible.

## Remaining concerns

No task-specific limitation remains. The production build continues to emit the documented nested-worktree/multiple-lockfile warning. This task changes frontend composition and presentation only; it adds no backend, schema, environment, dependency, or deployment change.

## Fix round 1: browser acceptance findings

Addressed both Important findings from `task-4-review.md` without changing product code:

- Administrator tab assertions now require every text label to produce a non-null, nonzero DOM range fully contained by its tab. Only intentionally hidden narrow-width icons may have a zero-width rectangle.
- The analogous Workspace assertion now requires a nonzero text range and containment for every one of its four labels.
- The Runtime browser path now opens **Provider endpoints** and **Execution resources**, locates the OpenAI remote endpoint input and labelled **Default engine** control, and verifies that the administrator panel contains no settings alert.

Final fix commands and results:

```powershell
$env:SOURCE_IMAGE_BROWSER_TEST='1'
$env:SOURCE_IMAGE_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:SOURCE_IMAGE_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test tests/source-image-browser.test.mjs
```

Result: **1 passed, 0 failed** (`duration_ms 16673.8729`).

```powershell
$env:TOOL_PERMISSIONS_BROWSER_TEST='1'
$env:TOOL_PERMISSIONS_PLAYWRIGHT_MODULE='file:///C:/Users/24216/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:TOOL_PERMISSIONS_BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --import tsx/esm --test tests/tool-permissions-browser.test.mjs
```

Result: **1 passed, 0 failed** (`duration_ms 9184.3096`). Scoped ESLint and Prettier checks over both changed browser fixtures passed, and `git diff --check` passed with no whitespace errors. Per the controller's test-only ruling, the production build and full unit suite were not repeated.

Self-review confirmed that zero-width tolerance remains only on optional icon geometry, text geometry is mandatory in both fixtures, both Runtime disclosures are opened through their real summaries, and the representative controls are asserted before the fixture continues. Browser-generated screenshot changes were restored because this round changes acceptance assertions only.

## Fix round 2: Runtime disclosure containment

Scoped both representative Runtime control locators to their intended native disclosures: the OpenAI remote endpoint is resolved through `providerEndpoints`, and **Default engine** is resolved through `executionResources`. The existing disclosure-open actions and administrator-panel no-alert assertion remain unchanged.

The enabled source/all-destinations fixture passed **1/1** (`duration_ms 16186.212`) with the same documented environment command. Scoped ESLint and Prettier checks for `tests/source-image-browser.test.mjs` passed, and `git diff --check` passed with no whitespace errors. Per the controller's test-only ruling, the permission fixture, production build, and full unit suite were not repeated.

Self-review confirmed that each locator is now a descendant query on the exact `details` instance opened immediately before it, closing the remaining review finding without changing runtime behavior or product code. Browser-regenerated screenshot changes were restored because the rendered product is unchanged.
