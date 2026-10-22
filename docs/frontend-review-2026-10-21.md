# Frontend review — 21 October 2026

Implemented in the companion `deep-agents-ui` repository.

| Before | After | Why |
| --- | --- | --- |
| A saved run could reconnect before history loaded. A token-only stream then hid earlier messages. | Existing threads wait for their saved state before SDK reconnection. New threads keep their optimistic stream. Sending is blocked until an existing thread is ready. | Fixes the reproduced refresh race without duplicating conversations. |
| Signing in after session expiry discarded the selected conversation. | Sign-in carries `threadId` and `assistantId` through the fresh document navigation. | Restores the selected conversation after authentication; arbitrary redirect URLs are not accepted. |
| Every history request downloaded up to ten complete checkpoints. | Fetch only the newest complete checkpoint. | Reduces repeated message/file payloads and avoids choosing an older branch when reopening a conversation. |
| A streamed `**heading*` prefix briefly rendered as italic, and italic font faces were not registered. | Stabilize incomplete bold emphasis only during streaming; register the existing Formular italic fonts. | Keeps intentional italic, nested emphasis, code, and authored document Markdown intact. |
| Closed reasoning disclosures still parsed Markdown on every update. | Mount reasoning Markdown only while the disclosure is open. | Removes unnecessary parsing, math rendering, and code loading from the streaming path. |
| Fixed panel minimum widths crowded out chat on phones and tablets; the header overflowed at intermediate widths. | Panels cover the content area below 1280px; header labels collapse, covered chat is inert, and panels support Escape. | Keeps controls and content within the viewport while preserving mounted chat state. |
| Wide, heavy transcript text and a translucent composer added visual weight. | Use a 960px transcript measure, regular assistant text, a solid composer, and smaller responsive gutters. | Improves readability and reduces visual clutter in both themes. |

The refresh regression was first observed failing against the prior exported build. It delays history, reloads with a saved run ID, and reconnects to a stream containing only a new message followed by a connection error. The fixed build retains both saved messages and the new streamed text.

Validation:

- `node --import tsx/esm --test tests/**/*.mjs`: 348 passed, 45 opt-in browser tests skipped, no failures.
- Production build, TypeScript, scoped ESLint, formatting, and `git diff --check` passed.
- Enabled browser suites passed for refresh, history retry, expired-session routing, queued/steering messages, attachment submission, autopilot approval, and streaming/motion stability.
- Browser layout checks covered 375×812, 812×375, 768×1024, 1024×768, and 1440×1000 in light and dark themes with reduced motion. Checked conversation, thread history, Workspace tools, and Admin People surfaces, viewport overflow, visible composer controls, real italic-font loading, and disclosure behavior.
- Markdown tests cover every prefix of a streamed bold phrase, intentional italic and nested emphasis, literal code, and document-mode preservation.

Representative screenshots: [light desktop](evidence/conversation-review/light-1440-chat.png), [dark mobile](evidence/conversation-review/dark-375-chat.png), [tablet workspace](evidence/conversation-review/light-768-workspace.png), [mobile admin](evidence/conversation-review/light-375-admin.png).

Browser verification used mocked backend responses and the real exported frontend. No live provider, deployment, or physical-device acceptance was performed. The layout checks cover the listed surfaces, not every settings form.
