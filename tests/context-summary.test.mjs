import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MessageTupleManager,
  toMessageDict,
} from "@langchain/langgraph-sdk/ui";
import {
  contextSummary,
  markStreamedContextSummary,
  contextUpdateEvent,
  projectContextUpdates,
} from "../src/lib/context-summary.ts";
import { ChatMessage } from "../src/app/components/ChatMessage.tsx";
import { ContextSummaryCard } from "../src/app/components/ContextSummaryCard.tsx";

const handoff = {
  goal: ["Find recent tickets"],
  constraints: ["Read-only"],
  decisions: ["Search BMZ and BSC"],
  completed: ["BMZ-23683: " + "Confirmed ticket details. ".repeat(30)],
  pending: [],
  next_steps: ["Check seed links"],
  artifacts: ["/conversation_history/example.json"],
};
const raw = JSON.stringify(handoff);
const marked = (content) => ({
  type: "human",
  content,
  additional_kwargs: { lc_source: "summarization" },
});

test("recognizes SDK summaries and preserves their full wrapper in raw view", () => {
  const wrapped = `You are in the middle of a conversation that has been summarized.\n<summary>\n${raw}\n</summary>`;
  const summary = contextSummary(marked(wrapped), wrapped);
  assert.deepEqual(
    summary.sections.map((s) => s.label),
    [
      "Goal",
      "Constraints",
      "Decisions",
      "Completed",
      "Pending",
      "Next steps",
      "Artifacts",
    ]
  );
  assert.deepEqual(summary.sections[3].items, handoff.completed);
  assert.equal(summary.raw, wrapped);
  assert.equal(summary.incomplete, false);
  const legacy = `Here is a summary of the conversation to date:\n\n${raw}`;
  assert.equal(contextSummary(marked(legacy), legacy).sections.length, 7);
});

test("recognizes marked assistant handoffs and leaves ordinary JSON in chat", () => {
  const assistantHandoff = { ...marked(raw), type: "ai" };
  assert.equal(contextSummary(assistantHandoff, raw).sections.length, 7);
  assert.equal(
    contextSummary(assistantHandoff, "```json\n" + raw + "\n```").sections
      .length,
    7
  );
  assert.equal(contextSummary({ type: "ai" }, raw), null);
  assert.equal(contextSummary({ type: "human" }, raw), null);
  assert.equal(
    contextSummary({ type: "ai" }, '{"goal":["ordinary response"]}'),
    null
  );
  assert.equal(contextSummary({ type: "ai" }, "Hello"), null);
});

test("preserves truncated and invalid marked summaries without guessing missing facts", () => {
  const truncated = raw.slice(0, raw.indexOf("Confirmed") + 12);
  for (const text of [truncated, "Old prose summary", '{"goal":[123]}']) {
    const summary = contextSummary(marked(text), text);
    assert.equal(summary.raw, text);
    assert.equal(summary.incomplete, true);
    assert.deepEqual(summary.sections, []);
  }
  assert.equal(contextSummary({ type: "ai" }, truncated), null);
});

test("card starts collapsed, counts items, expands long entries, and escapes untrusted text", () => {
  const payload = { ...handoff, goal: ['<script>alert("x")</script>'] };
  const summary = contextSummary(marked(raw), JSON.stringify(payload));
  const html = renderToStaticMarkup(
    React.createElement(ContextSummaryCard, { summary })
  );
  assert.match(html, /Agent context updated/);
  assert.match(html, /Completed/);
  assert.match(html, /1 item/);
  assert.match(html, /View raw/);
  assert.match(html, /BMZ-23683/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:[ =>])/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /No items/);
});

test("malformed summary renders a notice and accessible raw content", () => {
  const summary = contextSummary(marked('{"goal":['), '{"goal":[');
  const html = renderToStaticMarkup(
    React.createElement(ContextSummaryCard, { summary })
  );
  assert.match(html, /incomplete or unavailable/);
  assert.match(html, /View raw/);
});

test("draft chunks are kept out of the visible conversation", () => {
  const partial = '{"goal":["Find related evidence"]';
  const chunks = new MessageTupleManager();
  const id = chunks.add(
    { type: "AIMessageChunk", id: "handoff", content: partial },
    { lc_source: "summarization", langgraph_node: "model" }
  );
  const { chunk, metadata } = chunks.get(id);
  const ai = toMessageDict(chunk);
  const message = markStreamedContextSummary(ai, metadata);
  const html = renderToStaticMarkup(
    React.createElement(ChatMessage, {
      message,
      toolCalls: [],
      files: {},
      sourceImageAttachments: {},
    })
  );
  assert.deepEqual(projectContextUpdates([message]), []);
  assert.doesNotMatch(html, /<p>\{&quot;goal&quot;/);
  assert.equal(markStreamedContextSummary(ai, undefined), ai);
  const user = { ...ai, type: "human" };
  assert.equal(markStreamedContextSummary(user, metadata), user);
  assert.equal(ai.additional_kwargs?.lc_source, undefined);
  assert.deepEqual(
    projectContextUpdates([
      markStreamedContextSummary(
        { ...ai, additional_kwargs: { lc_source: "summarization" } },
        metadata
      ),
    ]),
    []
  );
});

test("four drafts and replayed start events converge on one accepted card", () => {
  const user = { type: "human", id: "user", content: "Find tickets" };
  const start = {
    type: "context_update",
    id: "/conversation_history/a.json",
    after_message_id: "user",
  };
  const live = contextUpdateEvent(start, undefined, "thread");
  assert.deepEqual(contextUpdateEvent(start, [], "thread"), live);
  assert.equal(contextUpdateEvent(start, ["child:1"], "thread"), null);
  for (const value of [
    null,
    {},
    { ...start, id: "" },
    { ...start, after_message_id: 4 },
  ]) {
    assert.equal(contextUpdateEvent(value, undefined, "thread"), null);
  }
  const drafts = Array.from({ length: 4 }, (_, index) =>
    markStreamedContextSummary(
      { type: "ai", id: `draft-${index}`, content: raw.slice(0, 60 + index) },
      { lc_source: "summarization" }
    )
  );
  const pending = projectContextUpdates([user, ...drafts], live);
  assert.equal(pending.length, 2);
  const summary = contextSummary(pending[1], "");
  assert.equal(summary.status, "updating");
  const html = renderToStaticMarkup(
    React.createElement(ContextSummaryCard, { summary })
  );
  assert.match(html, /Updating agent context/);
  assert.doesNotMatch(html, /Agent context updated|View raw|incomplete/);

  const answer = {
    type: "ai",
    id: "answer",
    content: "Found tickets",
    additional_kwargs: {
      context_update: { id: start.id, summary: raw },
    },
  };
  const committed = projectContextUpdates([user, ...drafts, answer], live);
  assert.equal(committed.length, 3);
  assert.equal(committed[1].id, pending[1].id);
  assert.equal(committed[2], answer);
  assert.equal(
    contextSummary(committed[1], committed[1].content).status,
    "updated"
  );
  assert.deepEqual(projectContextUpdates([user, answer]), committed);
  assert.equal(
    projectContextUpdates([user, answer, { ...answer, id: "replay" }]).length,
    4
  );
});

test("separate compactions remain distinct and stopped preparation never claims success", () => {
  const user = { type: "human", id: "user", content: "Find tickets" };
  const live = contextUpdateEvent(
    { type: "context_update", id: "range-2", after_message_id: "first" },
    [],
    "thread"
  );
  const first = {
    type: "ai",
    id: "first",
    content: "Working",
    additional_kwargs: {
      context_update: { id: "range-1", summary: raw },
    },
  };
  const interrupted = projectContextUpdates([user, first], {
    ...live,
    status: "interrupted",
  });
  assert.equal(interrupted.length, 4);
  const summary = contextSummary(interrupted[3], "");
  const html = renderToStaticMarkup(
    React.createElement(ContextSummaryCard, { summary })
  );
  assert.match(html, /Context update interrupted/);
  assert.doesNotMatch(html, /Agent context updated/);
  const second = {
    ...first,
    id: "second",
    additional_kwargs: {
      context_update: { id: "range-2", summary: raw },
    },
  };
  const committed = projectContextUpdates([user, first, second], live);
  assert.equal(
    committed.filter((message) => contextSummary(message, message.content))
      .length,
    2
  );
  assert.equal(
    projectContextUpdates([user], live).length,
    1,
    "missing anchors cannot leak progress into another thread"
  );
  assert.equal(
    projectContextUpdates([
      user,
      {
        ...first,
        additional_kwargs: { context_update: { id: "bad", summary: 42 } },
      },
    ]).length,
    2
  );
});

test("late replay tokens cannot erase committed metadata and removed messages prune it", () => {
  const records = new Map();
  const answer = {
    type: "ai",
    id: "answer",
    content: "Done",
    additional_kwargs: {
      context_update: { id: "range-1", summary: raw },
    },
  };
  const accepted = projectContextUpdates([answer], null, records);
  const replay = projectContextUpdates(
    [{ ...answer, additional_kwargs: {} }],
    null,
    records
  );
  assert.equal(replay[0], accepted[0]);
  assert.equal(records.size, 1);
  assert.deepEqual(projectContextUpdates([], null, records), []);
  assert.equal(records.size, 0);
  assert.equal(
    projectContextUpdates([{ ...answer, additional_kwargs: {} }], null, records)
      .length,
    1
  );
});
