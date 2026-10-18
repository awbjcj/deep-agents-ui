# Image preview verification

Image files and expanded Markdown images share a viewer with zoom buttons,
10–800% scale presets, fit to window, and fit to width. The default fit shows the
entire image without enlarging small images. Fit modes track viewport resizing;
explicit percentages keep the selected scale.

Scroll, touch-scroll, or drag an enlarged image to pan. When the image viewport
has keyboard focus, `+`/`-` zoom, `0` selects actual size, `F` fits the window, and
`W` fits the width. Escape closes the dialog and Markdown previews restore focus
to their trigger. Images inside Markdown links retain their link behavior.

The browser regression bundles the real `FileViewDialog` and `MarkdownContent`
components and compiles the project CSS. Its plots are generated locally, and it
does not require backend credentials.

Verified in Chromium:

- Zoom steps, scale limits, and preservation of the viewed center while zooming.
- Mouse panning and keyboard controls.
- Fit modes and responsive dialogs at 1440, 768, 390, and 320 pixels.
- Fixed scales surviving resizing; original bytes preserved by Download.
- Cached images, small images, failed loads, live replacements, and reopening.
- Markdown expansion, nested dialogs, Escape, and focus restoration.
- Linked images do not gain nested buttons.
- No unexpected browser console errors or page errors.

Validation: 304 unit tests passed, 25 opt-in browser tests skipped in the normal
suite; the image preview browser test passed separately. Production build,
TypeScript, ESLint for changed components, and formatting checks passed.

```bash
IMAGE_PREVIEW_BROWSER_TEST=1 node --test tests/image-preview-browser.test.mjs
```

If Playwright or Chromium is installed outside the project, set
`IMAGE_PREVIEW_PLAYWRIGHT_MODULE` to its `index.mjs` file URL and
`IMAGE_PREVIEW_BROWSER_EXECUTABLE` to the browser executable.

- [Desktop, fit to width](desktop.png)
- [320-pixel mobile](mobile.png)
- [320-pixel mobile, dark theme](mobile-dark.png)
