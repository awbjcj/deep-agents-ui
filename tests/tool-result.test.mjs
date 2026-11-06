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
  assert.equal(readableToolResult("unknown_tool", "x".repeat(50_001)), null);
  const malformed = '{"unfinished":';
  assert.deepEqual(readableToolResult("unknown_tool", malformed), {
    kind: "text",
    text: malformed,
    monospace: false,
  });
});
