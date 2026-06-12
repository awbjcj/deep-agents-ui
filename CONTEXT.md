# CONTEXT — Domain glossary

Shared vocabulary for this frontend. Use these terms in code, comments, reviews,
and architecture discussions so names stay stable. Architecture vocabulary
(module, seam, depth, leverage, locality) is separate — this file is domain only.

## Chat rendering

- **Message** — one turn in a thread as delivered by the LangGraph stream
  (`human`, `ai`, or `tool`). The raw stream re-creates these objects on every
  streamed token.

- **Tool Call** — an `ai` message's request to run a tool. Its **result** is
  delivered later as a separate `tool` message and folded back into the call
  during projection (see below). A `task` tool call denotes a **Subagent**.

- **Artifact** — the generative-UI surface a tool call can render
  (`LoadExternalComponent`), shown inside its **Tool Call Box**. The most
  expensive render unit in a message; "multiple artifacts" is the workload that
  motivated the Conversation Projection.

- **Rendered Message** — the render-ready unit a message becomes: the message
  plus its reconciled tool calls, a stable key, and an avatar flag. Implemented
  as `ProcessedMessage`. This is what `ChatMessage` consumes.

- **Conversation Projection** — the identity-stable transform from the raw
  stream (`stream.messages`) into `Rendered Message[]`. It reconciles tool
  results into their calls **and** preserves the referential identity of every
  message and tool call whose render-relevant content is unchanged, so the
  `React.memo`'d renderers (`ChatMessage`, `ToolCallBox`, the Artifacts) skip
  work during streaming. Lives in
  `src/app/hooks/internal/conversationProjection.ts`; consumed by `useChat` via
  `useProcessedMessages`. Without it, per-token render cost scales with the
  total number of artifacts in the thread rather than with what changed.

  *Known follow-up (out of scope for the projection):* the **live** streaming
  message still re-parses its own growing markdown every token. Throttling /
  segmenting that parse is a separate lever, deliberately not bundled with the
  identity work.
