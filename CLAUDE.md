# CLAUDE.md

Guidance for working in this frontend repository.

## Frontend

This repository is the Next.js frontend root.

Markdown rendering goes through `MarkdownContent` and supports GitHub-flavored Markdown (via `remark-gfm`), LaTeX math (via `remark-math` + `rehype-katex`, with `katex.min.css` imported globally), and Prism-highlighted code blocks.

File previews use `FileContentView`: Markdown files pass `mode="document"` to preserve authored syntax, while chat retains provider-specific normalization. Preview and Source are limited to 50,000 characters before parsing; Copy, Download, and editing use the complete file. Keep typography customizations under `theme.extend.typography` so the default prose styles remain available.

`FileContentView` offers Preview/Source modes for `.md` files. `src/app/utils/artifactPreview.ts` applies display-only transforms to agent artifacts: deepagents conversation-history files (`conversation_history/*.md`, LangChain XML message dumps) are rebuilt into a transcript with `read_file` line-number gutters stripped and tool output fenced, and legacy plain-text tool records offloaded as `/_artifacts/<user>/<thread>/<domain>/*.md` open in Source mode. Stored files are never rewritten; the transform runs on the (possibly bounded) preview only.

The Files list shows root thread `files` plus an overlay of files a delegated subagent saved but has not yet handed back (`src/lib/pending-files.ts`). Subagent writes reach the root thread only when its `task` returns, and the Agent Server cannot read dynamic subagent namespaces, so `useChat` collects them from `updates|tools:<id>` stream events and marks them "Saving" until the root state includes them or the run settles. Chat uploads and deletes run as separate maintenance runs outside the stream, so the composer calls `refreshFiles` afterwards.
