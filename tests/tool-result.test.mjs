import assert from "node:assert/strict";
import test from "node:test";
import { readableToolResult } from "../src/lib/tool-result.ts";

test("metadata and failures retain exact machine fields in a readable data view", () => {
  for (const name of [
    "list_scm_servers",
    "list_scm_repositories",
    "list_scm_branches",
    "list_scm_tags",
    "list_scm_reviews",
    "prepare_code_workspace",
    "analyze_code_workspace",
    "get_code_analysis_job",
    "cancel_code_analysis_job",
    "release_code_workspace",
    "list_confluence_pages",
    "get_confluence_page_storage",
    "build_confluence_image_markup",
    "list_polarion_documents",
    "get_polarion_test_record",
    "create_adaptive_card",
    "inspect_personal_skill",
    "unknown_tool",
  ]) {
    const value = {
      id: "exact/ID",
      pagination: { hasMore: null, nextStart: 0 },
      result: { ok: false, count: 0, text: "" },
    };
    for (const output of [value, JSON.stringify(value)])
      assert.deepEqual(readableToolResult(name, output), {
        kind: "data",
        value,
      });
  }
});

test("human content preserves line breaks and literal source remains monospace", () => {
  const text = "ID: exact/ID\nSummary: A result\n\nSecond paragraph";
  for (const name of [
    "get_jira_ticket",
    "get_polarion_work_item",
    "get_confluence_page",
    "get_email_content",
    "get_chat_messages",
    "get_jenkins_job_status",
    "get_sharepoint_file",
    "recall_user_history",
    "unknown_tool",
  ])
    assert.deepEqual(readableToolResult(name, text), {
      kind: "text",
      text,
      monospace: false,
    });
  for (const name of [
    "read_file",
    "run_python",
    "get_jenkins_console_output",
    "exec",
  ])
    assert.deepEqual(readableToolResult(name, '{"literal": true}\n'), {
      kind: "text",
      text: '{"literal": true}\n',
      monospace: true,
    });
});

test("SCM Markdown, empty collections and large-result fallbacks remain distinct", () => {
  const text = "### SCM access validation\n\n- Status: `running`";
  assert.deepEqual(readableToolResult("validate_scm_access", text), {
    kind: "markdown",
    text,
  });
  for (const value of [[], {}])
    assert.deepEqual(readableToolResult("unknown_tool", value), {
      kind: "data",
      value,
    });
  assert.equal(readableToolResult("unknown_tool", null), null);
  const json = JSON.stringify({ id: "exact/ID", body: "x".repeat(50_000) });
  const preview = readableToolResult("get_confluence_page_storage", json);
  assert.equal(preview.kind, "preview");
  assert.match(preview.text, /exact\/ID/);
  assert.ok(preview.text.length < json.length);
  assert.equal(preview.monospace, true);
  const literal = readableToolResult("read_file", "{literal}\n".repeat(6_000));
  assert.equal(literal.kind, "preview");
  assert.ok(literal.text.startsWith("{literal}\n"));
  assert.equal(literal.monospace, true);
  const malformed = '{"unfinished":';
  assert.deepEqual(readableToolResult("unknown_tool", malformed), {
    kind: "text",
    text: malformed,
    monospace: false,
  });
});

test("only generated conversation file links get an artifact Markdown view", () => {
  const header = "Created conversation files:";
  const diagram = "![design.png](/_artifacts/u/t/generated/design.png)";
  const file = "[data.json](/_artifacts/u/t/generated/data.json)";
  const checksum = `Bytes: 2; SHA-256: ${"a".repeat(64)}`;
  for (const [name, lines] of [
    ["render_diagram", [header, diagram]],
    ["publish_workspace_file", [header, file, checksum]],
  ]) {
    assert.deepEqual(readableToolResult(name, lines.join("\n")), {
      kind: "markdown",
      text: lines.join("\n\n"),
    });
  }
  const remote = `${header}\n![remote](https://example.com/pixel.png)`;
  assert.equal(readableToolResult("render_diagram", remote).kind, "text");
  assert.equal(
    readableToolResult("read_file", `${header}\n${file}`).kind,
    "text"
  );
});
