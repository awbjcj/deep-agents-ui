# Tool interactions — phase 1

Implemented October 4, 2026. This is the first phase of the AG-UI feasibility recommendation: improve the existing UI before changing transport.

- Database search evidence cards show titles, excerpts, available HTTP(S) source links and source metadata. Select results to append to the composer without sending. Unknown, failed, oversized and incomplete results keep generic output; raw output remains available for recognized results.
- Supported tools: `search_database` and `search_database_with_filter`, using the existing backend evidence format. Other search tools and structured protocol adapters are not implemented in this phase.
- Approval editing preserves string, number, boolean, array, object and null argument types. Invalid edits block submission; changed fields show before/after previews. Batch edits retain the existing decisions envelope and interrupt handling.
- Unsent composer drafts stay with their conversation for the mounted session. Creating a thread through concurrent uploads preserves the new-thread draft. Drafts are not persisted across reloads.

## Verification

- `npm test`: 263 passed, 12 opt-in browser tests skipped.
- `npx tsc --noEmit`: passed.
- Scoped ESLint on the changed source files: passed.
- Production static export: passed.
- `TOOL_INTERACTIONS_BROWSER_TEST=1 node --import tsx/esm --test tests/tool-interactions-browser.test.mjs`: passed using the bundled Playwright module through `TOOL_INTERACTIONS_PLAYWRIGHT_MODULE`.

The browser fixture mounts the real evidence cards, approval editor and composer, with thread-query, connectivity and attachment-service boundaries mocked. It checks selection, preservation of existing draft text, no automatic send, no duplicate insertion, thread isolation, typed approval payloads, invalid edit blocking, concurrent upload draft handoff and horizontal overflow at 390px. Existing interrupt tests cover stale and concurrent interrupt IDs. These are component and contract checks, not a live authenticated backend acceptance test.

[Desktop](desktop.png) and [mobile](mobile.png) screenshots show the component fixture with production CSS and synthetic data.

No AG-UI/CopilotKit dependency or endpoint was added. The opt-in protocol trial remains a separate phase requiring auth, persistence, reconnect and interrupt parity checks described in the research report. No deployment or Git commit was performed.
