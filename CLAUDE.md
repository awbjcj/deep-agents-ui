# CLAUDE.md

Guidance for working in this frontend repository.

## Frontend

This repository is the Next.js frontend root.

Markdown rendering goes through `MarkdownContent` and supports GitHub-flavored Markdown (via `remark-gfm`), LaTeX math (via `remark-math` + `rehype-katex`, with `katex.min.css` imported globally), and Prism-highlighted code blocks.

The file viewer (`FileViewDialog`) offers Preview/Source modes for `.md` files. `src/app/utils/artifactPreview.ts` applies display-only transforms to agent artifacts: deepagents conversation-history files (`conversation_history/*.md`, LangChain XML message dumps) are rebuilt into a transcript with `read_file` line-number gutters stripped and tool output fenced, and legacy plain-text tool records offloaded as `/_artifacts/<user>/<thread>/<domain>/*.md` open in Source mode. Stored files are never rewritten.
