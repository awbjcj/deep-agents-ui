import assert from "node:assert/strict";
import test from "node:test";
import {
  MessageTupleManager,
  toMessageDict,
} from "@langchain/langgraph-sdk/ui";

import { reconcileConversation } from "../src/app/hooks/internal/conversationProjection.ts";

test("explicit tool errors stay failed rather than appearing completed", () => {
  const messages = [
    {
      type: "ai",
      id: "a",
      content: "",
      tool_calls: [{ id: "tool", name: "read", args: {} }],
    },
    {
      type: "tool",
      id: "result",
      tool_call_id: "tool",
      status: "error",
      content: "Read failed",
    },
  ];
  const result = reconcileConversation(null, messages, false, false);
  assert.equal(result[0].toolCalls[0].status, "error");
  assert.equal(result[0].toolCalls[0].result, "Read failed");
  assert.equal(
    reconcileConversation(result, messages, false, true)[0],
    result[0]
  );
});

test("settled unresolved calls stop spinning and do not restart in a later turn", () => {
  const messages = [
    {
      type: "ai",
      id: "a",
      content: "",
      tool_calls: [{ id: "tool", name: "task", args: {} }],
    },
  ];
  const running = reconcileConversation(null, messages, false, true);
  assert.equal(running[0].toolCalls[0].status, "pending");
  const stopped = reconcileConversation(running, messages, false, false);
  assert.equal(stopped[0].toolCalls[0].status, "interrupted");
  const nextTurn = reconcileConversation(
    stopped,
    [...messages, { type: "human", id: "h", content: "Continue" }],
    false,
    true
  );
  assert.equal(nextTurn[0], stopped[0]);
  const resumed = reconcileConversation(stopped, messages, false, true);
  assert.equal(resumed[0].toolCalls[0].status, "pending");
  const completed = reconcileConversation(
    stopped,
    [...messages, { type: "tool", tool_call_id: "tool", content: "Done" }],
    false,
    false
  );
  assert.equal(completed[0].toolCalls[0].status, "completed");
});

// The SDK re-creates the messages array and shallow-spreads each message
// envelope every token, but keeps nested `content`/`tool_calls` references
// stable for finished messages. `frame()` simulates that: a fresh array of
// fresh envelopes that share the originals' nested refs.
const frame = (msgs) => msgs.map((m) => ({ ...m }));

test("empty provider fields do not hide normalized or content-block tools", () => {
  for (const message of [
    {
      additional_kwargs: { tool_calls: [] },
      tool_calls: [{ id: "tc", name: "read", args: { path: "a" } }],
    },
    {
      tool_calls: [],
      content: [
        { type: "tool_use", id: "tc", name: "read", input: { path: "a" } },
      ],
    },
  ]) {
    const projected = reconcileConversation(
      null,
      [{ type: "ai", id: "ai", content: "", ...message }],
      false
    );
    assert.equal(projected[0].toolCalls.length, 1);
    assert.equal(projected[0].toolCalls[0].name, "read");
  }
});

test("normalized arguments win over provider JSON and duplicate calls render once", () => {
  const args = { subagent_type: "research" };
  const [bucket] = reconcileConversation(
    null,
    [
      {
        type: "ai",
        id: "ai",
        content: "",
        additional_kwargs: {
          tool_calls: [
            {
              id: "tc",
              function: { name: "task", arguments: JSON.stringify(args) },
            },
          ],
        },
        tool_calls: [{ id: "tc", name: "task", args }],
      },
    ],
    false
  );
  assert.equal(bucket.toolCalls.length, 1);
  assert.equal(bucket.toolCalls[0].args, args);
});

test("provider JSON arguments are parsed and partial JSON stays renderable", () => {
  for (const [argumentsValue, expected] of [
    ['{"path":"a"}', { path: "a" }],
    ['{"path":', {}],
  ]) {
    const [bucket] = reconcileConversation(
      null,
      [
        {
          type: "ai",
          id: "ai",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "tc",
                function: { name: "read", arguments: argumentsValue },
              },
            ],
          },
        },
      ],
      false
    );
    assert.deepEqual(bucket.toolCalls[0].args, expected);
  }
});

test("Responses call blocks match results by call ID, including native output", () => {
  const tuples = new MessageTupleManager();
  const messages = [
    {
      type: "ai",
      id: "ai",
      content: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_1",
          name: "lookup",
          arguments: '{"key":"a"}',
        },
        {
          type: "custom_tool_call",
          id: "ct_1",
          call_id: "call_2",
          name: "expression",
          input: "2+2",
        },
        {
          type: "function_call",
          id: "fc_3",
          call_id: "call_3",
          name: "raw_lookup",
          arguments: '{"key":"b"}',
        },
        {
          type: "tool_search_call",
          id: "ts_1",
          call_id: "search_1",
          execution: "server",
        },
      ],
      tool_calls: [{ id: "call_1", name: "lookup", args: { key: "a" } }],
    },
    {
      type: "tool",
      id: "result-1",
      tool_call_id: "call_1",
      content: [{ type: "json", json: { id: "a" } }],
    },
    {
      type: "tool",
      id: "result-2",
      tool_call_id: "call_2",
      content: [{ type: "custom_tool_call_output", output: "4" }],
    },
    {
      type: "tool",
      id: "result-3",
      tool_call_id: "call_3",
      content: [{ type: "json", json: null, data: "ignored" }],
    },
  ].map((message) => {
    const id = tuples.add(message, {});
    return toMessageDict(tuples.get(id).chunk);
  });
  const [bucket] = reconcileConversation(null, messages, false);
  assert.equal(
    reconcileConversation([bucket], frame(messages), false)[0],
    bucket
  );
  assert.deepEqual(bucket.toolCalls, [
    {
      id: "call_1",
      name: "lookup",
      args: { key: "a" },
      status: "completed",
      result: '{"id":"a"}',
    },
    {
      id: "call_2",
      name: "expression",
      args: { __arg1: "2+2" },
      status: "completed",
      result: "4",
    },
    {
      id: "call_3",
      name: "raw_lookup",
      args: { key: "b" },
      status: "completed",
      result: "null",
    },
  ]);
});

test("legacy data and safe image links survive without exposing binary media", () => {
  const result = {
    type: "tool",
    id: "result",
    tool_call_id: "tc",
    name: "read_file",
    content: [
      { id: "exact/ID", status: "ok" },
      { type: "image_url", image_url: { url: "https://example.com/plot.png" } },
      {
        type: "image_url",
        image_url: "https://user:pass@example.com/hidden.png",
      },
      { type: "image", base64: "raw-bytes" },
    ],
  };
  const ai = {
    type: "ai",
    id: "ai",
    content: "",
    tool_calls: [{ id: "tc", name: "read_file", args: {} }],
  };
  const [row] = reconcileConversation(null, [ai, result], false);
  assert.deepEqual(row.toolCalls[0].imageUrls, [
    "https://example.com/plot.png",
  ]);
  assert.deepEqual(JSON.parse(row.toolCalls[0].result)[0], {
    id: "exact/ID",
    status: "ok",
  });
  assert.doesNotMatch(row.toolCalls[0].result, /raw-bytes|user:pass/);
  const [updated] = reconcileConversation(
    [row],
    [ai, { ...result, content: "text only" }],
    false
  );
  assert.equal(updated.toolCalls[0].imageUrls, undefined);
});

test("an early result is rendered once and attaches when its call arrives", () => {
  const result = {
    type: "tool",
    id: "result",
    tool_call_id: "tc",
    name: "lookup",
    status: "error",
    content: "Unavailable",
  };
  const ai = {
    type: "ai",
    id: "ai",
    content: "",
    tool_calls: [{ id: "tc", name: "lookup", args: {} }],
  };
  const orphan = reconcileConversation(null, [result], false);
  assert.deepEqual(
    orphan.map((row) => row.toolCalls[0]),
    [
      {
        id: "tc",
        name: "lookup",
        args: {},
        status: "error",
        result: "Unavailable",
      },
    ]
  );
  assert.equal(
    reconcileConversation(orphan, frame([result]), false)[0],
    orphan[0]
  );
  const attached = reconcileConversation(orphan, [result, ai], false);
  assert.equal(attached.length, 1);
  assert.equal(attached[0].message.id, "ai");
  assert.deepEqual(attached[0].toolCalls[0], orphan[0].toolCalls[0]);
});

test("tool calls with reused IDs pair only within the same user turn", () => {
  const human = (id) => ({ type: "human", id, content: "Lookup" });
  const call = (id) => ({
    type: "ai",
    id,
    content: "",
    tool_calls: [{ id: "reused", name: "lookup", args: {} }],
  });
  const result = (id) => ({
    type: "tool",
    id,
    tool_call_id: "reused",
    name: "lookup",
    content: id,
  });
  const runtime = (source) => ({
    type: "human",
    id: source,
    additional_kwargs: { lc_source: source },
    content: "Runtime message",
  });
  const rows = reconcileConversation(
    null,
    [
      human("first"),
      result("old-orphan"),
      human("second"),
      call("old-call"),
      human("third"),
      result("new-result"),
      runtime("rubric_grader"),
      runtime("summarization"),
      call("new-call"),
    ],
    false
  );
  assert.deepEqual(
    rows
      .filter((row) => row.toolCalls.length)
      .map((row) => [
        row.message.id,
        row.toolCalls[0].status,
        row.toolCalls[0].result,
      ]),
    [
      ["old-orphan", "completed", "old-orphan"],
      ["old-call", "interrupted", undefined],
      ["new-call", "completed", "new-result"],
    ]
  );
});

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

test("distinct early results with the same call ID survive and pair in order", () => {
  const human = { type: "human", id: "request", content: "Look up both" };
  const result = (id, content) => ({
    type: "tool",
    id,
    name: "lookup",
    tool_call_id: "shared",
    content,
  });
  const call = (id) => ({
    type: "ai",
    id,
    content: "",
    tool_calls: [{ id: "shared", name: "lookup", args: {} }],
  });
  const first = result("result-a", "First result");
  const second = result("result-b", "Second result");
  const callA = call("call-a");
  const callB = call("call-b");
  const output = (messages) =>
    reconcileConversation(null, [human, ...messages], false).flatMap((row) =>
      row.toolCalls.map((tool) => [row.message.id, tool.result])
    );

  assert.deepEqual(output([first, second]), [
    ["result-a", "First result"],
    ["result-b", "Second result"],
  ]);
  for (const messages of [
    [first, second, callA, callB],
    [callA, first, second, callB],
    [callA, callB, first, second],
  ]) {
    assert.deepEqual(output(messages), [
      ["call-a", "First result"],
      ["call-b", "Second result"],
    ]);
  }
  assert.deepEqual(
    output([
      callA,
      first,
      callB,
      { ...first, content: "Updated first" },
      second,
    ]),
    [
      ["call-a", "Updated first"],
      ["call-b", "Second result"],
    ]
  );

  const updateCall = {
    ...callB,
    tool_calls: [{ ...callB.tool_calls[0], name: "update_ticket" }],
  };
  const updateResult = { ...second, name: "update_ticket" };
  for (const messages of [
    [updateResult, first, callA, updateCall],
    [callA, updateCall, updateResult, first],
    [callA, updateResult, first, updateCall],
  ]) {
    assert.deepEqual(output(messages), [
      ["call-a", "First result"],
      ["call-b", "Second result"],
    ]);
  }
});

test("unchanged messages keep their bucket references across frames", () => {
  const human = { type: "human", id: "h1", content: "hi" };
  const ai = { type: "ai", id: "a1", content: "hello" };

  const p1 = reconcileConversation(null, [human, ai], false);
  const p2 = reconcileConversation(p1, frame([human, ai]), false);

  assert.equal(p2[0], p1[0], "human bucket reused by reference");
  assert.equal(p2[1], p1[1], "ai bucket reused by reference");
});

test("cached tool content is replaced when new result blocks arrive", () => {
  const ai = {
    type: "ai",
    id: "a",
    content: "",
    tool_calls: [{ id: "tc", name: "read", args: {} }],
  };
  const result = {
    type: "tool",
    id: "r",
    tool_call_id: "tc",
    content: [{ type: "text", text: "first" }],
  };
  const first = reconcileConversation(null, [ai, result], false);
  const unchanged = reconcileConversation(first, frame([ai, result]), false);
  assert.equal(unchanged[0], first[0]);
  const updated = reconcileConversation(
    unchanged,
    [ai, { ...result, content: [{ type: "text", text: "latest" }] }],
    false
  );
  assert.equal(updated[0].toolCalls[0].result, "latest");
  assert.notEqual(updated[0].toolCalls[0], first[0].toolCalls[0]);
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
  assert.equal(
    p2[0].message,
    p1[0].message,
    "message ref preserved (render-equal)"
  );

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
