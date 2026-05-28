# v3 Event-Streaming Migration — Design

**Status:** approved (brainstorming), pending implementation plan
**Author:** brainstorming session 2026-05-28
**Scope:** parity migration — enable `__event_streaming_v2` on the server without breaking the chat UI. No new UI in this PR.

---

## Background

`useChat.ts` consumes the LangGraph stream via `@langchain/langgraph-sdk`'s React `useStream` hook. Setting `configurable.__event_streaming_v2: true` routes the run through the server's v3 streaming path (`langgraph-api/stream_v2.py`, `graph.astream_events(version="v3")`), which emits a different per-frame envelope.

`useStream` decodes frames through `dist/ui/manager.js:enqueue`. On line 456 of that file:

```js
if (this.matchEventType("messages", event, data)) {
    const [serialized, metadata] = data;   // throws under v3
```

The destructure assumes `data` is the legacy `[serialized, metadata]` tuple. Under v3 `data` is an object, the destructure invokes `Symbol.iterator` on a non-iterable, and the chat dies on the first `messages|*` frame.

The SDK ships v3-aware primitives (`StreamingMessageAssembler`, `ToolCallAssembler`, `SubagentDiscoveryHandle` in `dist/client/stream/`) but the React `useStream` hook does not consume them. To enable v3, we must drive the SDK's low-level `client.runs.stream()` API ourselves.

## Goal

Replace the `useStream` call inside `useChat.ts` with a hand-rolled hook that consumes v3 projections, preserving the existing `useChat()` return contract so no consumer changes.

Parity only. No new UI. The contract carries v3-only projection fields (`subagents`, `toolCalls`, `subgraphs`) for a future subagent-panel PR; they are always-defined-but-empty under the legacy backend and populated under v3, with no consumer reading them in this PR.

## Non-goals

- Live subagent panel rendering
- Live tool-call args streaming UI
- Per-message metadata UI changes
- Backend changes (`langgraph-api`, `vsda-deep-agent`)

---

## Architecture

```
src/app/hooks/
  useChat.ts                ← public API, unchanged consumers; chooses backend
                              by NEXT_PUBLIC_USE_V3_STREAM
  internal/
    streamTypes.ts          ← StreamView<TState> contract
    useLegacyStream.ts      ← extracted current useStream wrapper
    useV3Stream.ts          ← new; drives client.runs.stream() projections
```

**Backend selection.** `useChat.ts` reads `process.env.NEXT_PUBLIC_USE_V3_STREAM` (Next inlines build-time, so the branch is a constant). Default `false`. When `true`, `useV3Stream` runs and sets `configurable.__event_streaming_v2 = true` itself; legacy never sets the flag.

**Seam location.** Inside `useChat.ts`. Higher (e.g. `ChatProvider`) would force consumers to branch; lower (e.g. per-call site of `stream.submit`) would duplicate thread/metadata/config wiring across `sendMessage`/`runSingleStep`/`continueStream`/`resumeInterrupt`.

**What stays put** (above the seam, unchanged):

- `processedMessages` memo (`useChat.ts:348-434`) — tool-call reconciliation
- `setFiles` optimistic-files mirror
- `handleCustomEvent` notification routing
- `ensureThreadId` thread-creation gating
- `threadCreationMetadata`

---

## Hook API contract — `StreamView<TState>`

Both backends produce this. Mirrors what `useChat` reads from `stream.*` today, plus three forward-looking projections.

```ts
// src/app/hooks/internal/streamTypes.ts

export interface StreamView<TState> {
  // Live state — populated from .values frames
  values: Partial<TState>;
  messages: Message[];
  isLoading: boolean;
  isThreadLoading: boolean;
  interrupt: unknown | undefined;
  getMessagesMetadata: (
    message: Message
  ) => { firstSeenState?: ThreadState<TState> } | undefined;

  // Mutations
  submit: (input: SubmitInput, opts: SubmitOptions) => void;
  stop: () => void;

  // v3 projections — always defined; empty under legacy
  subagents: Map<string, SubagentSnapshot>;
  toolCalls: Map<string, ToolCallSnapshot>;
  subgraphs: SubgraphNode[];
}

type SubmitInput =
  | { messages: Message[] }
  | undefined           // resume from checkpoint
  | null;               // command-only (resume / goto)

interface SubmitOptions {
  optimisticValues?: (prev: Partial<TState>) => Partial<TState>;
  config?: Record<string, unknown>;
  checkpoint?: Checkpoint;
  interruptBefore?: string[];
  interruptAfter?: string[];
  streamSubgraphs?: boolean;
  streamMode?: StreamMode[];        // legacy only; v3 ignores
  metadata?: Record<string, unknown>;
  command?: { goto?: string; update?: unknown; resume?: unknown };
}

interface SubagentSnapshot {
  name: string;
  status: "pending" | "running" | "completed" | "errored";
  messages: Message[];
  toolCallIds: string[];
}

interface ToolCallSnapshot {
  id: string;
  name: string;
  args: unknown;                    // may be partial during streaming
  argsComplete: boolean;
  status: "pending" | "running" | "completed" | "errored";
  result?: string;
}

interface SubgraphNode {
  namespace: string[];              // e.g. ["task:abc123", "research"]
  parentToolCallId?: string;
}

export type StreamHook<TState> = (opts: {
  assistantId: string;
  client: Client;
  threadId: string | null;
  onThreadId: (id: string) => void;
  reconnectOnMount?: boolean;
  fetchStateHistory?: boolean;
  onFinish?: () => void;
  onError?: (err: unknown) => void;
  onCreated?: () => void;
  onCustomEvent?: (evt: unknown) => void;
}) => StreamView<TState>;
```

**Notes.**

- `getMessagesMetadata` is retained at parity. Under v3 we replicate the SDK's lazy fetch: cache snapshots by message ID, populate via `client.threads.getState` on first ask.
- `streamMode` is accepted but ignored by `useV3Stream` — v3 derives streams from projections.
- The v3-only projections are documented as future-facing. `processedMessages` remains the source of truth for tool-call reconciliation in this PR; `toolCalls` is the future-facing parallel source for live-arg rendering. Divergence risk noted in the risk register.

---

## Frame projection mapping (v3 → React state)

v3 exposes multiple async iterables off one stream handle. Each projection has its own `for await` consumer, all sharing one `AbortController`.

```
client.runs.stream(threadId, assistantId, opts) →
  handle.values        AsyncIterable<Partial<TState>>
  handle.messages      AsyncIterable<StreamingMessageEvent>
  handle.toolCalls     AsyncIterable<ToolCallEvent>
  handle.subagents     AsyncIterable<SubagentLifecycleEvent>
  handle.subgraphs     AsyncIterable<SubgraphEvent>
  handle.custom        AsyncIterable<unknown>
  handle.interrupts    AsyncIterable<InterruptEvent>
```

| Projection | Reducer behavior | StreamView slice |
|---|---|---|
| `.values` | `(prev, snapshot) => ({ ...prev, ...snapshot })`; if snapshot has `__interrupt__`, also update `interrupt` | `values`, `interrupt` |
| `.messages` | Consume the projection's per-token / lifecycle events and maintain a `Map<id, Message>`; rebuild `messages: Message[]` on insert/update. Whether the projection yields pre-assembled messages or raw deltas (requiring `StreamingMessageAssembler` on the consumer side) is an implementation-plan verification item — see Open question 3. | `messages` |
| `.toolCalls` | `toolCalls.set(id, snapshot)` per delta | `toolCalls` |
| `.subagents` | `subagents.set(toolCallId, snapshot)` per lifecycle event | `subagents` |
| `.subgraphs` | Append-dedupe by namespace | `subgraphs` |
| `.custom` | Forward to `onCustomEvent` callback | (none) |
| `.interrupts` | Same as `values.__interrupt__` — whichever lands first wins | `interrupt` |

**State container.** One `useReducer` with actions `{type, payload}`. Each projection dispatches; React 18+ auto-batches across `await` boundaries.

**Memory bound.** `subagents` and `toolCalls` Maps are keyed by tool-call id (unique per thread). Growth bounded by the existing `messages` array — no new growth class.

**Isolation rationale.** The legacy `enqueue()` interleaves all event types in one switch. A malformed frame in one event class crashes the entire loop (which is exactly the line-456 bug). Per-projection loops let one broken projection take itself down without unwinding siblings.

---

## Submit lifecycle

```
stream.submit(input, opts) →
  1. Apply optimisticValues to local state (immediate paint)
  2. Resolve threadId (create via POST /threads if absent)
       → onThreadId(newId), onCreated()
  3. Abort any in-flight stream (shared AbortController)
  4. Open new stream:
       client.runs.stream(threadId, assistantId, {
         input, command, config, checkpoint,
         interruptBefore, interruptAfter,
         streamSubgraphs, metadata,
         signal: abortCtrl.signal
       })
     Spawn one consumer per projection.
     Each is in its own try/catch.
  5. await Promise.allSettled(consumers)
       → isLoading=false
       → onFinish() | onError(err)
       → AbortController replaced
```

**Concurrent-submit serialization.** A single promise chain (`this.queue = this.queue.then(() => runSubmit(...))`) ensures the second submit waits for the first stream to close. Matches today's `useStream` behavior.

**On-mount join (existing thread).** When the hook mounts with non-null `threadId` and `reconnectOnMount: true`:

1. Set `isThreadLoading = true`.
2. `await client.threads.getState(threadId)` → seed `values` and `messages`.
3. Open `client.runs.joinStream(threadId, ...)` to attach to any active run. Same projection consumers.
4. `isThreadLoading = false`.

**Interrupt resume.** `submit(null, { command: { resume: value } })`:

```ts
client.runs.stream(threadId, assistantId, {
  command: { resume: value },
  // no `input`, no `checkpoint` — server resumes from interrupt
})
```

**Optimistic rollback.** Match `useStream`: do not roll back on error. User re-submits.

**`fetchStateHistory`.** Preserve the lazy fetch — cache snapshots by message ID, populate via `client.threads.getState` on first `getMessagesMetadata(msg)` call.

---

## Rollout

1. PR ships both backends behind `NEXT_PUBLIC_USE_V3_STREAM` (default `false`).
2. Deploy → flag off → no behavior change.
3. Flip on in dev/staging. Run smoke matrix.
4. Flip on in prod. Monitor 1 release.
5. Follow-up cleanup PR: delete `useLegacyStream.ts` + the flag.

### Smoke-test matrix (manual, before prod flip)

| # | Scenario | Expected |
|---|---|---|
| 1 | New thread → "hello" → assistant streams | Tokens paint; `processedMessages` builds tool-call list |
| 2 | Existing thread reload mid-stream | `joinStream` reattaches; remaining tokens land in same message |
| 3 | Click stop mid-stream | `AbortController` cancels; partial message preserved |
| 4 | Tool requires HITL approval | `interrupt` surfaces; `submit(null, {command:{resume}})` continues |
| 5 | File write from middleware | `values.files` repaints within 1 frame |
| 6 | Custom event from ToolErrorNotificationMiddleware | `onCustomEvent` fires; toast/banner appears |
| 7 | Subagent task spawn (`task` tool) | Same outward behavior as today; `subagents` Map populates (unrendered) |
| 8 | Rapid double-submit | Queued — second waits for first to close |
| 9 | Network drop mid-stream | `onError` fires; user can resubmit |

### Risk register

| Risk | Mitigation |
|---|---|
| Future SDK v3 frame shape change | Per-projection try/catch isolates breakage to one slice; SDK pinned by exact version |
| Legacy backend rots after flag flips | Sunset PR within 1 release |
| `processedMessages` vs `toolCalls` projection divergence | `processedMessages` is source of truth in this PR. `toolCalls` is future-facing — no consumer. Documented in `streamTypes.ts`. |
| Optimistic-files mirror | Unchanged — reads `stream.values.files`; both backends write that slice identically |
| Notification routing | Unchanged — both backends forward `onCustomEvent` |
| Per-message metadata lazy load | v3 path replicates lazy fetch (smoke matrix row 2) |
| Race on `ensureThreadId` during rapid submit | Existing `creatingThreadRef.current` Promise-cache preserved above the seam |

---

## Out of scope

- Subagent panel UI
- Live tool-call args rendering
- Backend changes (server already supports v3)
- Automated tests for the new hook (called out as a known gap; see Open question 1)

## Acceptance criteria

With `NEXT_PUBLIC_USE_V3_STREAM=true`:

1. Every row in the smoke matrix passes
2. Zero visible behavior change vs the legacy path
3. Network panel shows the v3 envelope on `client.runs.stream` requests
4. `processedMessages` produces identical `ToolCall[]` arrays compared to a parallel legacy-path session against the same prompt

## Open questions

1. **Automated tests.** Should the implementation plan include Playwright+MSW coverage of the smoke matrix? Brainstorming session deferred this; recommend adding to the implementation plan.
2. **Sunset timeline.** "One release cycle" is vague — fix during implementation planning based on the team's release cadence.
3. **Messages-projection shape.** The `.messages` projection's exact yield type (assembled messages vs. raw deltas to feed through `StreamingMessageAssembler`) needs to be confirmed by reading `dist/client/stream/index.cjs` before implementation. If the SDK already assembles, the reducer is trivial; if it yields deltas, we instantiate `StreamingMessageAssembler` per message ID.
