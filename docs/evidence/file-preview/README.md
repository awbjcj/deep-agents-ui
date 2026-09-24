# Middleware file preview verification

The regression fixture mounts the real `FilesPopover` and `FileViewDialog`
components with in-memory graph files, including the middleware-style path
`/_artifacts/user/thread/confluence/report.md` and `{ content: string[] }` data.
It bundles the components with esbuild and runs Chromium against a local server.
Screenshots use the production build's CSS. This verifies frontend behavior;
it does not exercise a live backend or middleware write.

## Verified behavior

- Open previews follow graph updates; active drafts survive those updates.
- Existing nested artifact paths can be saved, including empty content.
- Failed saves retain the draft; active runs disable saving; Cancel restores the preview.
- Large Markdown is shortened before parsing. Copy and Download retain the full
  content, including the tail beyond the preview limit. Empty downloads work.
- Preview/Source controls, Markdown emphasis, visible ordered-list numbers,
  preserved list starts, and both directions of footnote navigation work.
- Deleted files stop displaying; a JSON file loads the dark syntax theme.
- Desktop and 390-pixel mobile dialogs fit the viewport, with no page errors.
- Unopened text artifacts are not decoded while listing file cards.

## Checks

- `node --import tsx/esm --test tests/**/*.mjs`: 249 passed, 10 opt-in tests skipped.
- Dedicated browser regression: passed separately with the flag below.
- `node node_modules/next/dist/bin/next build`: passed, including TypeScript.
- ESLint and Prettier for changed source files: passed.
- `git diff --check`: passed.

Run the browser regression after building, with an available Playwright package
and Chromium installation:

```powershell
$env:FILE_VIEW_BROWSER_TEST = '1'
# Optional: an absolute file URL to an installed Playwright index.mjs.
$env:FILE_VIEW_PLAYWRIGHT_MODULE = 'file:///path/to/playwright/index.mjs'
node --test tests/file-view-browser.test.mjs
```

Use plain `node --test` for this standalone browser harness; its esbuild bundle
already compiles the TSX. No backend credentials are needed.

## Screenshots

- [Desktop](desktop.png)
- [Mobile](mobile.png)
- [Mobile dark theme](mobile-dark.png)

The preview budget is 50,000 UTF-16 code units, trimmed to a line boundary where
possible. Code blocks above 20,000 units use plain text instead of Prism. These
are work limits, not measured latency guarantees. No dependencies were added.
