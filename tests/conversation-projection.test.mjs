import assert from "node:assert/strict";
import test from "node:test";

import { reconcileConversation } from "../src/app/hooks/internal/conversationProjection.ts";

// The SDK re-creates the messages array and shallow-spreads each message
// envelope every token, but keeps nested `content`/`tool_calls` references
// stable for finished messages. `frame()` simulates that: a fresh array of
// fresh envelopes that share the originals' nested refs.
const frame = (msgs) => msgs.map((m) => ({ ...m }));

// Identity-independent view, for asserting values are correct regardless of refs.
const strip = (projected) =>
  projected.map((b) => ({
    id: b.message.id,
    type: b.message.type,
    content: b.message.content,
    showAvatar: b.showAvatar,
    toolCalls: b.toolCalls.map((tc) => ({
      id: tc.id,
      status: tc.status,
      result: tc.result,
    })),
  }));

test("unchanged messages keep their bucket references across frames", () => {
  const human = { type: "human", id: "h1", content: "hi" };
  const ai = { type: "ai", id: "a1", content: "hello" };

  const p1 = reconcileConversation(null, [human, ai], false);
  const p2 = reconcileConversation(p1, frame([human, ai]), false);

  assert.equal(p2[0], p1[0], "human bucket reused by reference");
  assert.equal(p2[1], p1[1], "ai bucket reused by reference");
});

test("a growing live message gets a new bucket; siblings stay stable", () => {
  const human = { type: "human", id: "h1", content: "hi" };
  const ai = { type: "ai", id: "a1", content: "hel" };

  const p1 = reconcileConversation(null, [human, ai], false);
  const aiGrown = { ...ai, content: "hello" }; // new content ref = live token
  const p2 = reconcileConversation(p1, [{ ...human }, aiGrown], false);

  assert.equal(p2[0], p1[0], "untouched human bucket keeps its reference");
  assert.notEqual(p2[1], p1[1], "live ai bucket is reallocated");
  assert.equal(p2[1].message.content, "hello");
});

test("a landed tool result re-allocates only its own tool call (two-level)", () => {
  const ai = {
    type: "ai",
    id: "a1",
    content: "",
    tool_calls: [
      { id: "tc1", name: "read", args: { p: 1 } },
      { id: "tc2", name: "grep", args: { q: "x" } },
    ],
  };

  const p1 = reconcileConversation(null, [ai], false);
  const toolResult = {
    type: "tool",
    id: "t1",
    tool_call_id: "tc1",
    content: "file contents",
  };
  const p2 = reconcileConversation(p1, [{ ...ai }, toolResult], false);

  assert.notEqual(p2[0], p1[0], "bucket changes because a result landed");
  assert.equal(p2[0].message, p1[0].message, "message ref preserved (render-equal)");

  assert.notEqual(
    p2[0].toolCalls[0],
    p1[0].toolCalls[0],
    "tc1 reallocated — its result changed"
  );
  assert.equal(
    p2[0].toolCalls[1],
    p1[0].toolCalls[1],
    "tc2 preserved — its sibling's result is irrelevant to it"
  );
  assert.equal(p2[0].toolCalls[0].status, "completed");
  assert.equal(p2[0].toolCalls[0].result, "file contents");
  assert.equal(p2[0].toolCalls[1].status, "pending");
});

test("interrupt flip re-allocates only pending tool calls", () => {
  const ai = {
    type: "ai",
    id: "a1",
    content: "",
    tool_calls: [{ id: "tc1", name: "read", args: { p: 1 } }],
  };

  const p1 = reconcileConversation(null, [ai], false);
  const p2 = reconcileConversation(p1, [{ ...ai }], true);

  assert.notEqual(p2[0].toolCalls[0], p1[0].toolCalls[0]);
  assert.equal(p2[0].toolCalls[0].status, "interrupted");
});

test("appending a message keeps existing references and recomputes avatars", () => {
  const h1 = { type: "human", id: "h1", content: "a" };
  const a1 = { type: "ai", id: "a1", content: "b" };

  const p1 = reconcileConversation(null, [h1, a1], false);
  const h2 = { type: "human", id: "h2", content: "c" };
  const p2 = reconcileConversation(p1, [{ ...h1 }, { ...a1 }, h2], false);

  assert.equal(p2[0], p1[0]);
  assert.equal(p2[1], p1[1]);
  assert.equal(p2[2].message.id, "h2");
  assert.equal(p2[2].showAvatar, true, "human after ai shows an avatar");
});

test("reconciled values match a from-scratch projection (no lost updates)", () => {
  const ai = {
    type: "ai",
    id: "a1",
    content: "answer",
    tool_calls: [{ id: "tc1", name: "read", args: { p: 1 } }],
  };
  const toolResult = {
    type: "tool",
    id: "t1",
    tool_call_id: "tc1",
    content: "done",
  };
  const messages = [{ type: "human", id: "h1", content: "go" }, ai, toolResult];

  const incremental = reconcileConversation(
    reconcileConversation(null, [messages[0], ai], false),
    frame(messages),
    false
  );
  const fromScratch = reconcileConversation(null, frame(messages), false);

  assert.deepEqual(strip(incremental), strip(fromScratch));
});
