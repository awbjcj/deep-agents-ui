import test from "node:test";
import assert from "node:assert/strict";
import { parsePresentation } from "../src/lib/ui-presentation.ts";
import { reasoningSummary } from "../src/lib/reasoning-summary.ts";

const presentation = {
  kind: "ui_presentation",
  version: 1,
  title: "Results",
  blocks: [
    { type: "markdown", text: "Verified summary" },
    { type: "table", columns: ["Source", "Count"], rows: [["Jira", "3"]] },
    {
      type: "metrics",
      items: [{ label: "Sources", value: "3", detail: "Retrieved" }],
    },
    { type: "chart", items: [{ label: "Jira", value: 3 }], unit: "tickets" },
    { type: "links", items: [{ label: "Source", url: "https://example.com" }] },
    { type: "suggestions", items: ["Compare the sources"] },
  ],
};

test("all six catalog blocks survive a saved tool result", () => {
  assert.deepEqual(
    parsePresentation("present_result", JSON.stringify(presentation)),
    presentation
  );
  assert.equal(parsePresentation("unknown", presentation), null);
  assert.equal(parsePresentation("present_result", "x".repeat(200001)), null);
  assert.equal(parsePresentation("present_result", "{"), null);
});

test("catalog rejects executable URLs, arbitrary components, malformed rows and non-finite values", () => {
  for (const block of [
    { type: "iframe", src: "https://example.com" },
    { type: "links", items: [{ label: "Bad", url: "javascript:alert(1)" }] },
    {
      type: "links",
      items: [{ label: "Bad", url: "https://user:secret@example.com" }],
    },
    { type: "table", columns: ["A"], rows: [["one", "two"]] },
    { type: "chart", items: [{ label: "A", value: Infinity }] },
    { type: "chart", items: [{ label: "A", value: -2 }] },
    { type: "markdown", text: "fine", script: "alert(1)" },
  ])
    assert.equal(
      parsePresentation("present_result", { ...presentation, blocks: [block] }),
      null
    );
});

test("reasoning disclosure uses provider display text and ignores opaque encrypted data", () => {
  assert.equal(
    reasoningSummary({
      type: "ai",
      content: [
        {
          type: "reasoning",
          encrypted_content: "secret",
          summary: [{ type: "summary_text", text: "Checked sources" }],
        },
        { type: "thinking", thinking: "Compared results" },
        { type: "text", text: "Answer" },
      ],
    }),
    "Checked sources\n\nCompared results"
  );
  assert.equal(
    reasoningSummary({
      type: "ai",
      content: [{ type: "reasoning", encrypted_content: "secret" }],
    }),
    ""
  );
});
