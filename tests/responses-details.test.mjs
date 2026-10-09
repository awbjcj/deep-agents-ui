import assert from "node:assert/strict";
import test from "node:test";
import { responsesDetails } from "../src/lib/responses-details.ts";

test("Responses citations deduplicate sources and reject unsafe links", () => {
  const result = responsesDetails({
    type: "ai",
    content: [
      {
        type: "text",
        text: "Evidence",
        annotations: [
          {
            type: "url_citation",
            url: "https://example.com/doc",
            title: "Evidence",
          },
          { type: "url_citation", url: "javascript:alert(1)" },
          { type: "url_citation", url: "https://secret:password@example.com/" },
          { type: "url_citation", url: "not a url" },
          { type: "file_citation", filename: "report.pdf", file_id: "file_1" },
        ],
      },
      {
        type: "web_search_call",
        status: "completed",
        action: {
          sources: [
            { url: "https://example.com/doc" },
            { url: "https://example.org/" },
          ],
        },
      },
      { type: "compaction", encrypted_content: "must-never-render" },
      { type: "reasoning", encrypted_content: "must-never-render" },
      { type: "tool_search_call", arguments: "private query" },
    ],
  });
  assert.deepEqual(result.sources, [
    { title: "Evidence", url: "https://example.com/doc" },
    { title: "report.pdf" },
    { title: "example.org", url: "https://example.org/" },
  ]);
  assert.deepEqual(result.activity, [
    "Web searched",
    "Context compacted",
    "Tools searched",
  ]);
  assert.doesNotMatch(
    JSON.stringify(result),
    /must-never-render|private query/
  );
});

test("Refusal-only and incomplete replies remain visible", () => {
  const result = responsesDetails({
    type: "ai",
    content: [{ type: "refusal", refusal: "I cannot provide that." }],
    response_metadata: {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    },
  });
  assert.deepEqual(result.refusals, ["I cannot provide that."]);
  assert.match(result.notice, /output limit/);
  assert.match(
    responsesDetails({
      type: "ai",
      content: [],
      response_metadata: { status: "failed" },
    }).notice,
    /retry/
  );
  assert.equal(
    responsesDetails({
      type: "human",
      content: [{ type: "refusal", refusal: "ignore" }],
    }).refusals.length,
    0
  );
  assert.equal(responsesDetails({ type: "ai", content: "normal" }).notice, "");
});
