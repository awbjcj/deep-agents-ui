Message queue verification, October 26, 2026.

Queued prompts remain in an ordered list above the composer until the current
response finishes. Each prompt supports Edit, Delete, Move up/down, and Steer.
The queue can be paused and resumed. Editing pauses dispatch;
Save or Ctrl/Cmd+Enter applies the change, and Cancel or Escape restores the
original text. Empty text-only edits cannot be saved. Images, attachment metadata,
and valid skill references survive text edits.

Queue drafts are scoped to the deployment, account and conversation and saved in this tab's
session storage. Keep the conversation open for automatic delivery. Changing
conversations pauses its unsent drafts, and reopening restores them. Server run
discovery prevents a disconnected response from releasing drafts early.

Both delivery modes submit a single `human` message to LangGraph. Queue uses
`enqueue`; steering uses `interrupt` and preserves remaining local drafts. Stop
pauses local drafts and cancels accepted runs, including late acceptance and
ordinary active runs with no saved stream ID. Definite rejections show Retry;
uncertain acceptance shows Check delivery, which never submits again. Uncertain
drafts cannot be edited. Backend-validated receipt metadata carries the message ID.
SDK automatic retries are disabled. Old saved queues migrate paused for review.
Steering is also persisted before acceptance; refresh restores an in-flight send
as unconfirmed. Unconfirmed delivery pauses the queue and revokes Autopilot.

The named delivery menu sets Enter's behavior. Ctrl/Cmd+Enter selects the other
behavior for that message; Shift+Enter inserts a newline; Escape stops a response.
IME composition and held Enter cannot accidentally send. Tab retains focus
navigation. Queue mutations have no animation. The status count is announced
once above the composer.

Reference behavior: [Codex steering and queuing](https://learn.chatgpt.com/docs/prompting#steering-and-queuing)
and [Claude Code's queue](https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works),
checked October 26, 2026. This web interface adopts the explicit queue/steer choice
and editable ordered drafts. Its LangGraph steering interrupts and starts from
saved state; it does not implement native same-turn/tool-boundary injection.
Unsent drafts require this chat to remain open and are not a durable server inbox.

| Before                                         | After                                                          | Why                                           |
| ---------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| A queue count with immediate server submission | Visible ordered prompts with Edit and Delete before submission | Users can revise or withdraw waiting requests |
| No editing state                               | Inline textarea, keyboard save/cancel, paused dispatch         | Completion cannot race an unfinished edit     |
| Pending messages cannot be reviewed            | Scrollable list with persistent action buttons                 | Works with touch, keyboard, and long prompts  |
| Unlabeled delivery chevron                     | Named choice and alternate-action keyboard hint                | Makes submission predictable                  |
| Stop discards queued drafts                    | Stop pauses and retains drafts                                 | Prevents losing follow-up work                |
| Ambiguous network failure can be retried       | Receipt check without resubmission                             | Avoids replaying possibly accepted work       |
| No queue priority controls                     | Move up/down and promote one message to Steer                  | Adjust upcoming work without rewriting it     |

React Best Practices review:

| Before                                               | After                                                                | Why                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Unchanged server polls allocated new state           | Polls retain state and run identities when observed fields match     | Idle polling does not commit updates to the chat tree |
| Opening an editor serialized the entire queue        | Storage writes only follow draft or pause changes                    | Avoid repeatedly serializing attachment data          |
| Saved drafts checked only top-level fields           | Versioned snapshots validate content, attachments, and duplicate IDs | Invalid browser data cannot crash queue rendering     |
| Each row scanned every draft for active sends        | The queue computes sending state once                                | Keep rendering work linear in queue size              |
| Clicking Edit again reset unsaved text               | Repeated Edit preserves the current text                             | Prevent accidental loss while editing                 |
| Queue actions searched the document for the composer | Actions use the owning composer's ref callback                       | Keep keyboard focus within the correct composer       |

The queue composes the official AI Elements Queue primitives from
`vercel/ai-elements/packages/elements/src/queue.tsx`. The hosted registry was
unreachable in this environment, so only the used primitives were copied from
the official GitHub source, with local imports and the upstream license notice.
Existing conversation rendering remains unchanged.

Screenshots `queue-320.png`, `queue-768.png`, `queue-1024.png`, and `queue-1440.png`
show the production build at each tested viewport width.
`queue-edit.png` shows the inline editor and paused queue.
`queue-dark-375.png`, `queue-dark-812.png`, and `queue-dark-1440.png` cover dark mode
with reduced motion, including a short landscape viewport and multiple drafts.

Verification commands:

```sh
npm test
npm run build
MESSAGE_DELIVERY_BROWSER_TEST=1 node --test tests/message-delivery-browser.test.mjs
MESSAGE_RUNS_BROWSER_TEST=1 node --test tests/message-runs-browser.test.mjs tests/attachment-submission-browser.test.mjs
MESSAGE_RUNS_BROWSER_TEST=1 node --test tests/queued-messages-browser.test.mjs
```

The browser commands accept `CHAT_PLAYWRIGHT_MODULE` and `CHAT_CHROMIUM_PATH`
when Playwright and Chrome are installed outside the project. Browser tests use
fixture accounts and a local SSE server. They verify request roles and edited
content, FIFO delivery, deletion, keyboard controls, scope/restoration, retry,
Stop races, responsive overflow, and application console errors.

Final verification on October 26, 2026:

- Frontend suite: 376 passed, 49 opt-in browser tests skipped, no failures.
- Focused opt-in browser suites passed for the production composer, queue hook,
  run recovery/cancellation, and attachment submission. They cover light/dark
  layouts from 320px to 1440px, reduced motion, 812x375 landscape, keyboard
  shortcuts, IME/repeated-key protection, reordering, paused-draft restoration,
  legacy migration, lost acknowledgements, and uncertain delivery without replay.
  Review regressions also cover unchanged poll commits, redundant storage writes,
  malformed saved drafts, and repeated Edit without losing unsaved text.
- Production build, TypeScript, scoped ESLint/Prettier and whitespace checks passed.
- Companion backend: 124 tests passed across message delivery, authorization,
  and orchestration routing; scoped Ruff checks passed.

These are local fixture and contract checks. No live model execution or deployed
LangGraph acceptance test was performed, and the changes have not been deployed.
