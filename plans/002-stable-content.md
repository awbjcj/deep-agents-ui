# 002 — Preserve reading and preview state

- **Status**: DONE
- **Commit**: `03df9cb` (audit baseline)
- **Severity**: HIGH
- **Category**: Accessibility, interruptibility, rendering stability
- **Estimated scope**: `ChatInterface.tsx`, `MarkdownContent.tsx`, reduced-motion hook and regression tests

## Problem

`src/app/components/ChatInterface.tsx:69` originally used `useStickToBottom()` without options. The installed hook writes `scrollTop` through a spring; CSS reduced-motion rules cannot suppress those writes. Its wheel-ancestor lookup also fails to identify the transcript's mixed x/y overflow during content resizing.

`src/app/components/MarkdownContent.tsx:640` defined `a` and `img` components inside `useMemo(..., [files])`. Any file-map change replaced those component types, remounting existing images and closing previews. Lazy highlighted code initially used an unwrapped fallback with different font metrics.

## Target

```ts
useStickToBottom({
  initial: "instant",
  resize: reducedMotion ? "instant" : "smooth",
});
```

Subscribe to live `prefers-reduced-motion` changes with `useSyncExternalStore`, using a conservative `true` server snapshot. Cancel an existing spring before resuming instant following; never recapture a reader who has scrolled away. Explicit upward wheel input stops following. A Jump to latest button uses instant scroll for keyboard/reduced motion and the installed hook's existing smooth behavior for pointer activation.

Hoist Markdown renderer functions into one stable map. Read changing files through context, preserving image nodes and open preview state while still resolving newly available artifacts. Share code block font size `0.95em`, line height `1.5`, padding `1em`, weight `500` and inherited code metrics. Lazy highlighted fallback wraps with `pre-wrap`, `break-all` and `break-word`; plain/oversized code keeps horizontal overflow.

## Repo conventions to follow

Keep the existing `use-stick-to-bottom` hook and `MarkdownImage` size/error handling. Preserve artifact path validation and local-download behavior. Reuse `ThemedSyntaxHighlighter` lazy loading. See [React state preservation](https://react.dev/learn/preserving-and-resetting-state) and the [installed hook's upstream API](https://github.com/stackblitz-labs/use-stick-to-bottom).

## Steps

1. Add `src/app/hooks/useReducedMotion.ts` with media-query subscription and cleanup; configure initial/resize scrolling explicitly in `ChatInterface.tsx`.
2. On reduced-motion changes, use public `stopScroll` and `scrollToBottom` APIs to cancel an existing spring before following instantly. Preserve scroll-away state.
3. Handle upward transcript wheel input explicitly. Add the conditional Jump to latest control above the composer without changing scroll-container dimensions.
4. Add `MarkdownFilesContext`, hoist stable artifact renderers, and provide `files` around `ReactMarkdown`. Preserve all existing safe URL and download checks.
5. Share code-block metrics and inherit them on both code elements. Only the highlighted fallback adopts highlighted wrapping; plain and oversized code keeps its current scrollable semantics.
6. Test instant imperative writes, user escape during resize, keyboard return, live preference changes, image element identity, open-dialog preservation and fallback/highlighted height.

## Boundaries

No animated text, paragraph reveals, height tweening, table stagger, delayed content, forced focus changes or backend changes. Do not replace the scroll or Markdown libraries. Keep source bytes and safe artifact resolution intact.

## Verification

- Mechanical: `node --import tsx/esm --test tests/markdown-render.test.mjs tests/markdown.test.mjs`; `yarn.cmd tsc --noEmit`; production `yarn.cmd build`.
- Browser: enable `ANIMATION_REFINEMENTS_BROWSER_TEST=1`; run `node --import tsx/esm --test tests/animation-refinements-browser.test.mjs`.
- Feel check: stream a long response, scroll up while it grows, confirm the reading position stays put; invoke Jump to latest by keyboard and pointer. Change OS reduced motion during following and while reading history. No spring should persist in reduced motion.
- Open a Markdown image, save an unrelated artifact, and confirm the dialog and loaded image remain. Delay Prism loading for a long code line, then release it; measured height must remain within 2px. At 10% animation playback, only intended status/chrome feedback moves.
- Done when these checks pass without remounting readable content or moving an escaped reader. Verified in Chromium with chat services mocked; live backend/provider acceptance is outside this UI change.
