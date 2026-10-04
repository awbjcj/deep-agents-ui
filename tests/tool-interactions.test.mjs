import test from "node:test";
import assert from "node:assert/strict";
import { parseToolEvidence, evidenceDraft } from "../src/lib/tool-evidence.ts";
import {
  argumentDrafts,
  parseArgumentDrafts,
} from "../src/lib/approval-fields.ts";

const output =
  "(reranked 10 candidates to top 2 via test; scores are relevance scores)\n\n[1] (score: 0.8123)\n    evidence: First line\nSecond line\n    metadata: source_type: confluence | title: Design notes | webui_link: https://example.com/page\n\n[2] (score: -0.1234)\n    evidence: Another excerpt\n    metadata: summary: Ticket summary | polarion_url: javascript:alert(1)";

test("database cards retain multiline evidence and only expose safe source links", () => {
  const items = parseToolEvidence("search_database", output);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Design notes");
  assert.equal(items[0].excerpt, "First line\nSecond line");
  assert.equal(items[0].url, "https://example.com/page");
  assert.equal(items[1].title, "Ticket summary");
  assert.equal(items[1].url, undefined);
  const draft = evidenceDraft([items[1]]);
  assert.match(draft, /Another excerpt/);
  assert.doesNotMatch(draft, /First line/);
  assert.equal(
    parseToolEvidence(
      "search_database_with_filter",
      output.replaceAll("\n", "\r\n")
    ).length,
    2
  );
});

test("unknown, failed, incomplete and oversized results retain generic rendering", () => {
  for (const value of [
    null,
    {},
    "Retrieval failed (transient)",
    "[1] (score: 0.5)\n    evidence: partial",
    "x".repeat(200_001),
  ]) {
    assert.deepEqual(parseToolEvidence("search_database", value), []);
  }
  assert.deepEqual(parseToolEvidence("unrelated_tool", output), []);
  assert.equal(
    parseToolEvidence(
      "search_database",
      output.replace(
        "https://example.com/page",
        "https://user:secret@example.com/page"
      )
    )[0].url,
    undefined
  );
});

test("approval drafts preserve types, including JSON-looking strings", () => {
  const original = {
    text: '{"keep":"string"}',
    count: 2,
    enabled: true,
    values: [1],
    options: { x: 1 },
    empty: null,
  };
  const drafts = argumentDrafts(original);
  assert.deepEqual(parseArgumentDrafts(original, drafts), {
    args: original,
    errors: {},
  });
  const result = parseArgumentDrafts(original, {
    ...drafts,
    count: "3",
    enabled: "false",
    values: "[2,3]",
  });
  assert.equal(result.args.count, 3);
  assert.equal(result.args.enabled, false);
  assert.deepEqual(result.args.values, [2, 3]);
});

test("invalid and type-changing edits are rejected rather than silently coerced", () => {
  const result = parseArgumentDrafts(
    { count: 2, options: {}, values: [], empty: null },
    { count: '"3"', options: "{", values: "{}", empty: "false" }
  );
  assert.deepEqual(Object.keys(result.errors), [
    "count",
    "options",
    "values",
    "empty",
  ]);
  assert.deepEqual(result.args, {});
  assert.ok(parseArgumentDrafts({ count: 1 }, { count: "1e999" }).errors.count);
});
