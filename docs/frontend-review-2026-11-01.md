# Frontend review — 1 November 2026

Conversation surfaces reviewed against the Aptiv brand guide and the existing motion rules in [`plans/README.md`](../plans/README.md). No dependencies or backend contracts changed.

| Before                                                                                                                        | After                                                                                                                                                   | Why                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Inline code rendered as `` `VSDA-118` `` with literal backticks from the typography plugin's `::before`/`::after`.            | `prose-code:before:content-none prose-code:after:content-none`.                                                                                         | Bug: the chip already marks code; backticks read as unrendered Markdown.                                   |
| Blockquotes gained curly quotes, italic text, doubled paragraph margins, and dropped `bg-secondary/40` / `border-primary/50`. | Quote-mark pseudo-content removed; flat callout with `border-[hsl(var(--primary)/0.55)]`, `bg-muted/60` and no paragraph margin.                        | Bug: those opacity modifiers target CSS-variable colour keys, so Tailwind silently produced no style.      |
| A new conversation was an empty canvas above the composer.                                                                    | Welcome view: brand mark, purpose statement, the specialist agents, and four editable starter prompts. Choosing one fills the composer; it never sends. | Wayfinding and a clear first action. Untouched starter text is replaced; a typed draft is always kept.     |
| Tool rows were unstyled text; the open subagent row used a different size, weight and background from its own detail panel.   | Tool rows: icon tile, monospace name, border on hover/open. Subagents: one card with a “Subagent” label, icon tile and attached input/output panel.     | Tool calls and delegated work now read as distinct, scannable agent steps. Failed steps tint the icon red. |
| Reasoning used the native disclosure triangle.                                                                                | Reasoning icon plus the same rotating chevron as tool rows (pointer-only motion, instant from the keyboard).                                            | One disclosure language across the transcript.                                                             |
| Theme toggle track matched the header surface; the orange thumb was the loudest element in the bar.                           | Recessed track with a neutral thumb; the icon carries the orange (day) or teal (night). Transform-only motion is unchanged.                             | Aptiv orange is reserved for highlights.                                                                   |
| History loading showed the word “Loading...”.                                                                                 | A conversation-shaped skeleton (`motion-safe:animate-pulse`) with an accessible “Loading conversation” status.                                          | Avoids a layout jump when history arrives.                                                                 |

## Agent-specific welcome

Each built-in agent has its own welcome: mark, headline, scope statement, capability chips and four starter prompts drawn from that agent's real abilities (for example, Jira offers JQL search and change history; Code Analyzer offers revision comparison and background reports). Copy lives in `src/lib/agent-welcome.ts`, keyed by graph ID, and mirrors the agent catalog in `ConfigDialog`. Custom assistants use their graph's copy; unknown graphs fall back to the supervisor's. The view waits for the selected assistant to resolve, so it never flashes another agent's copy, and it remounts when the agent changes.

## Motion

The welcome view rises once: `opacity 0 → 1`, `translateY(6px) → 0`, `240ms cubic-bezier(0.23, 1, 0.32, 1)` via `@starting-style`, with no stagger. It is shown once per new conversation and never delays typing. Starter cards press to `scale(0.985)` over `150ms`. Card hover styles change colour and shadow only and are limited to `(hover: hover) and (pointer: fine)`. Reduced motion removes the rise and the press scale.

## Rejected candidates

- Assistant avatars or per-message entrances: rejected because they repeat on every turn, and a reader does not need them.
- Staggered starter cards: rejected because new conversations are frequent and the stagger would add delay without information.
- Animated welcome background or orbiting mark: decorative motion that would compete with the composer.

## Verification

- `yarn test`: 413 passed, no failures (browser suites are opt-in).
- New `tests/agent-welcome.test.mjs`: every graph in `langgraph.json` has distinct copy and four unique prompts; legacy and unknown IDs resolve.
- New `tests/welcome-state-browser.test.mjs` (`WELCOME_STATE_BROWSER_TEST=1`): starter prompts fill and replace, edited drafts are kept, reduced motion drops the rise, switching to the Jira agent shows its own welcome and prompts, inline code and blockquotes have no pseudo-content, and saved conversations skip the welcome view.
- Existing `animation-refinements`, `conversation-refresh`, `tool-results` and `frontend-review` browser suites passed against the rebuilt static export.
- TypeScript, scoped ESLint and Prettier passed.

Screenshots use mocked services with the real exported frontend: [welcome, light](evidence/welcome-state/light-1440-welcome.png), [welcome, dark phone](evidence/welcome-state/dark-390-welcome.png), [agent steps, dark](evidence/welcome-state/dark-1440-agent-steps.png), [Jira agent](evidence/welcome-state/light-1440-jira-agent.png), [Code Analyzer agent, dark](evidence/welcome-state/dark-1440-code-analyzer-agent.png), [Knowledge Base agent, phone](evidence/welcome-state/light-390-knowledge-base-agent.png). Before: [empty view](evidence/welcome-state/before-light-1440-empty.png), [agent steps](evidence/welcome-state/before-dark-1440-agent-steps.png).
