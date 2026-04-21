# VSDA Deep Agent — UI Kit

## Overview
High-fidelity UI kit for the **VSDA Deep Agent** web application — an AI orchestration chat interface built on LangGraph/LangSmith.

## Source
- GitHub: `awbjcj/vsda-deep-agent` (branch: `main`)
- Frontend: `src/frontends/app/` (Next.js + Tailwind + Radix UI + Lucide)

## Screens Covered
1. **Login** — username/password with register toggle
2. **Main App** — resizable 3-panel layout (thread list / chat / utility sidebar)
3. **Thread List** — grouped by date, status indicators, interrupt badges
4. **Chat Interface** — user/agent messages, tool call boxes, todo list
5. **Tool Approval** — interrupt with approve/reject
6. **Token Sidebar** — API token management panel
7. **User Sidebar** — user management with role badges

## Design Notes
- Dark mode by default (`#0f0f0f` bg)
- Primary action color: `#2F6868` (teal, not Aptiv Orange — intentional for utility UI)
- Icons: Lucide (stroke, 16–20px)
- Font: system stack (Arial fallback)
- No gradients; flat surfaces with subtle borders
