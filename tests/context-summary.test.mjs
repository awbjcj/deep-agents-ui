import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { contextSummary } from "../src/lib/context-summary.ts";
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

test("recognizes assistant handoff JSON without reclassifying user JSON or unrelated output", () => {
  assert.equal(contextSummary({ type: "ai" }, raw).sections.length, 7);
  assert.equal(
    contextSummary({ type: "ai" }, "```json\n" + raw + "\n```").sections.length,
    7
  );
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
  assert.equal(contextSummary({ type: "ai" }, truncated).incomplete, true);
});

test("card starts collapsed, counts items, expands long entries, and escapes untrusted text", () => {
  const payload = { ...handoff, goal: ['<script>alert("x")</script>'] };
  const summary = contextSummary({ type: "ai" }, JSON.stringify(payload));
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
