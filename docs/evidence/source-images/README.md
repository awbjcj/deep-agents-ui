# Source image browser evidence

These screenshots come from `tests/source-image-browser.test.mjs` against the
production static export with authenticated API and thread-state responses
intercepted in the browser.

| Evidence                               | Browser behavior                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `admin-source-controls-healthy.png`    | Four independent source rows, a saved Jira policy, and explicit Graph attachment access.                                |
| `admin-source-controls-desktop.png`    | A failed Confluence save rolls that row back without changing Polarion.                                                 |
| `admin-source-controls-narrow.png`     | The source controls stack without page or row overflow at 390 px.                                                       |
| `connectivity-source-policy-retry.png` | A failed preference read is shown as unavailable until keyboard Retry hydrates it.                                      |
| `attachment-preview-live.png`          | A hydrated Jira source image decodes, previews, uses the source filename as its title, and retains its provenance link. |
| `attachment-deleted-unavailable.png`   | After authoritative deletion and state reload, the historical reference remains visible as unavailable.                 |

Build before running the browser gate:

```powershell
yarn build
$env:SOURCE_IMAGE_BROWSER_TEST = "1"
node --test tests/source-image-browser.test.mjs
```

The test is opt-in so the normal Node test suite does not require Playwright.
It imports the installed `playwright` package by default. Environments with a
bundled module or browser can override both locations without changing the
test:

```powershell
$env:SOURCE_IMAGE_BROWSER_TEST = "1"
$env:SOURCE_IMAGE_PLAYWRIGHT_MODULE = "file:///absolute/path/to/playwright/index.mjs"
$env:SOURCE_IMAGE_BROWSER_EXECUTABLE = "C:\absolute\path\to\browser.exe"
node --test tests/source-image-browser.test.mjs
```

The recorded run used headless Microsoft Edge through these two overrides. It
asserted keyboard operation, pending row locks, scope permission normalization,
save rollback, narrow layout, fail-closed preference loading, decoded image
dimensions, reference-only run input with no inline source bytes, DELETE 409 and
500 rollback, successful DELETE plus live-state reload, and the final stale
reference presentation.

## Microsoft Graph attachment policy

`graph-attachment-policy.png` shows the Graph selector beside the existing source
controls. `graph-attachment-policy-375px.png`, `graph-attachment-policy-390px.png`,
and `graph-attachment-policy-dark.png` capture the responsive and dark checks.

After building, set `GRAPH_ATTACHMENT_BROWSER_TEST=1` to run the focused Graph
browser gate with the same Playwright/browser overrides. It verifies all three
mode payloads, normalization of an older custom policy, rollback after a failed
save, source-row bounds at 375 and 390 px, dark rendering, and no browser errors.
The full source-image gate includes these checks too.

The full gate passed after the review. Admin tabs now retain visible labels
without horizontal overflow at 375 and 390 px, and source controls respond to
their containing panel's width. The Graph selector accurately labels older
policies that default to embedded content while allowing all attachments on
request; selecting All attachments saves an all-attachment default explicitly.
