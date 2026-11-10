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

test("the first streamed handoff chunk renders in the summary card", () => {
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
  assert.match(html, /Agent context updated/);
  assert.doesNotMatch(html, /<p>\{&quot;goal&quot;/);
  assert.equal(markStreamedContextSummary(ai, undefined), ai);
  const user = { ...ai, type: "human" };
  assert.equal(markStreamedContextSummary(user, metadata), user);
  assert.equal(ai.additional_kwargs?.lc_source, undefined);
});
