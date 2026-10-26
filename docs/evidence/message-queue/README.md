Message queue verification, October 26, 2026.

Queued prompts remain in an ordered list above the composer until the current
response finishes. Each prompt supports Edit and Delete. Editing pauses dispatch;
Save or Ctrl/Cmd+Enter applies the change, and Cancel or Escape restores the
original text. Empty text-only edits cannot be saved. Images, attachment metadata,
and valid skill references survive text edits.

Queue drafts are scoped to the account and conversation and saved in this tab's
session storage. Keep the conversation open for automatic delivery. Changing
conversations pauses its unsent drafts, and reopening restores them. Server run
discovery prevents a disconnected response from releasing drafts early.

Both delivery modes submit a single `human` message to LangGraph. Queue uses
`enqueue`; steering uses `interrupt` and preserves remaining local drafts. Stop
clears local drafts and cancels accepted follow-ups, including late acceptance.
Failed submissions stay in the list with Retry and Delete controls. Submission
metadata carries the message ID so retries can reconcile an already accepted run.

| Before                                         | After                                                          | Why                                           |
| ---------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| A queue count with immediate server submission | Visible ordered prompts with Edit and Delete before submission | Users can revise or withdraw waiting requests |
| No editing state                               | Inline textarea, keyboard save/cancel, paused dispatch         | Completion cannot race an unfinished edit     |
| Pending messages cannot be reviewed            | Scrollable list with persistent action buttons                 | Works with touch, keyboard, and long prompts  |

The queue composes the official AI Elements Queue primitives from
`vercel/ai-elements/packages/elements/src/queue.tsx`. The hosted registry was
unreachable in this environment, so only the used primitives were copied from
the official GitHub source, with local imports and the upstream license notice.
Existing conversation rendering remains unchanged.

Screenshots `queue-320.png`, `queue-768.png`, `queue-1024.png`, and `queue-1440.png`
show the production build at each tested viewport width.
`queue-edit.png` shows the inline editor and paused queue.

Verification commands:

```sh
yarn test
yarn build
MESSAGE_DELIVERY_BROWSER_TEST=1 node --test tests/message-delivery-browser.test.mjs
MESSAGE_RUNS_BROWSER_TEST=1 node --test tests/message-runs-browser.test.mjs tests/attachment-submission-browser.test.mjs
MESSAGE_RUNS_BROWSER_TEST=1 node --test tests/queued-messages-browser.test.mjs
```

The browser commands accept `CHAT_PLAYWRIGHT_MODULE` and `CHAT_CHROMIUM_PATH`
when Playwright and Chrome are installed outside the project. Browser tests use
fixture accounts and a local SSE server. They verify request roles and edited
content, FIFO delivery, deletion, keyboard controls, scope/restoration, retry,
Stop races, responsive overflow, and application console errors.
