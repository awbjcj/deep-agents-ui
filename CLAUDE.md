# CLAUDE.md

Guidance for working in this frontend repository.

## Frontend

This repository is the Next.js frontend root.

Markdown rendering goes through `MarkdownContent` and supports GitHub-flavored Markdown (via `remark-gfm`), LaTeX math (via `remark-math` + `rehype-katex`, with `katex.min.css` imported globally), and Prism-highlighted code blocks.

File previews use `FileContentView`: Markdown files pass `mode="document"` to preserve authored syntax, while chat retains provider-specific normalization. Preview and Source are limited to 50,000 characters before parsing; Copy, Download, and editing use the complete file. Keep typography customizations under `theme.extend.typography` so the default prose styles remain available.
