# Chat recovery and projection performance

Verified locally on 2026-09-16 against the frontend checkout based on `fc1cda8`.

## Behavior

- Empty provider tool arrays no longer hide normalized calls or content blocks.
- Provider JSON arguments are parsed; partial arguments remain renderable.
- Calls are deduplicated by ID, with normalized arguments taking precedence.
- A task without parsed subagent metadata remains visible as an ordinary tool.
- Render consumers receive reactive stream snapshots; event callbacks read a
  latest-stream ref. Ordinary rows do not receive unused stream props.
- History errors and slow loads preserve the selected conversation, with an
  in-page retry action. Failed completion refreshes reject instead of returning
  stale history to the SDK when it is about to clear live values.

## Validation

- `node --import tsx/esm --test tests/**/*.mjs`: 231 passed, 9 opt-in tests skipped.
- Focused ESLint and `yarn build`: passed, including TypeScript checking.
- `node --test tests/chat-recovery-browser.test.mjs` with `CHAT_BROWSER_TEST=1`:
  passed against the production export with mocked API responses. Set
  `CHAT_PLAYWRIGHT_MODULE` and `CHAT_CHROMIUM_PATH` when using external tooling.
  An initial history error leaves the URL selected; Retry restores the answer,
  read-file tool, and research subagent with zero main-frame navigations and
  zero browser page errors. Screenshot: [recovered.png](recovered.png).

## Synthetic processing measurement

Compared the original projection from `fc1cda8` with the changed projection in
the same Node process. Workload: 200 completed tools, each with 200 text blocks
of approximately 117 characters, followed by one changing assistant message.
After 20 warm-up frames, measured five batches of 100 frames and took the
median time per frame:

| Projection | Milliseconds per frame |
| --- | ---: |
| Original | 5.159 |
| Cached immutable tool-result text | 0.090 |

The cache uses weak content-array keys so old threads can be collected. A
regression verifies new content blocks replace the cached result. These are
synthetic projection timings, not browser Web Vitals or live-backend latency.
Live model streaming and external generative UI were not exercised by this
mocked browser test.
