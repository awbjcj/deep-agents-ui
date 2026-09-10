# Source image browser evidence

These screenshots come from `tests/source-image-browser.test.mjs` against the
production static export with authenticated API and thread-state responses
intercepted in the browser.

| Evidence                               | Browser behavior                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `admin-source-controls-healthy.png`    | Three independent source rows, a saved Jira policy, and visible inactive switch borders.                                |
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
