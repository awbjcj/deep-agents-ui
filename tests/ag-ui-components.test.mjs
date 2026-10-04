import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePresentation,
  parseClarification,
  clarificationAnswers,
} from "../src/lib/ui-presentation.ts";
import {
  panelAction,
  selectedFileContext,
  saveTrialFile,
  editableTrialPath,
} from "../src/lib/trial-workspace.ts";
import { reasoningSummary } from "../src/lib/reasoning-summary.ts";
import { resumeCommand } from "../src/lib/ag-ui-trial.ts";

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
const form = parseClarification({
  kind: "clarification",
  version: 1,
  title: "Scope",
  fields: [
    { id: "project", label: "Project", type: "select", options: ["A", "B"] },
    { id: "limit", label: "Limit", type: "number" },
    { id: "include", label: "Include closed", type: "boolean" },
    {
      id: "sources",
      label: "Sources",
      type: "multiselect",
      options: ["Jira", "Wiki"],
    },
    { id: "notes", label: "Notes", type: "text", required: false },
  ],
});

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

test("clarification keeps false and zero and rejects invalid or missing responses", () => {
  assert.ok(form);
  assert.equal(Object.keys(clarificationAnswers(form, {}).errors).length, 4);
  const parsed = clarificationAnswers(form, {
    project: "A",
    limit: "0",
    include: false,
    sources: ["Wiki"],
  });
  assert.deepEqual(parsed, {
    answers: { project: "A", limit: 0, include: false, sources: ["Wiki"] },
    errors: {},
  });
  const invalid = clarificationAnswers(form, {
    project: "unknown",
    limit: "Infinity",
    include: "false",
    sources: ["Wiki", "Wiki"],
  });
  assert.equal(Object.keys(invalid.errors).length, 4);
});

test("clarification rejects duplicate and unsafe field IDs or unsupported field types", () => {
  for (const fields of [
    [{ id: "constructor", label: "X", type: "text" }],
    [{ id: "x", label: "X", type: "script" }],
    [{ id: "x", label: "X", type: "select", options: [] }],
    [
      { id: "x", label: "X", type: "text" },
      { id: "x", label: "Y", type: "text" },
    ],
  ])
    assert.equal(
      parseClarification({
        kind: "clarification",
        version: 1,
        title: "Test",
        fields,
      }),
      null
    );
});

test("mixed approvals and clarification answers retain their exact interrupt mapping", () => {
  const entries = [
    {
      interruptId: "approval",
      status: "resolved",
      payload: { decisions: [{ type: "reject", message: "No" }] },
    },
    {
      interruptId: "form",
      status: "resolved",
      payload: { answers: { include: false } },
    },
  ];
  assert.deepEqual(
    resumeCommand(entries, [{ id: "approval" }, { id: "form" }]),
    { resume: { approval: entries[0].payload, form: entries[1].payload } }
  );
});

test("file context is bounded, deduplicated and limited to the current thread", () => {
  const files = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [`/${i}`, "text"])
  );
  assert.deepEqual(
    selectedFileContext(["/missing", "/0", "/0", ...Object.keys(files)], files),
    ["/0", "/1", "/2", "/3", "/4"]
  );
  assert.deepEqual(selectedFileContext(["/removed"], { "/removed": null }), []);
  assert.deepEqual(
    panelAction({
      kind: "ui_action",
      action: "focus_panel",
      id: "p",
      panel: "tasks",
    }),
    { id: "p", panel: "tasks" }
  );
  assert.equal(
    panelAction({
      kind: "ui_action",
      action: "focus_panel",
      id: "p",
      panel: "admin",
    }),
    null
  );
});

function fileClient({
  active = false,
  text = "original",
  source = false,
  fail = false,
  paused = false,
  encoding = "utf-8",
} = {}) {
  const writes = [];
  return {
    writes,
    runs: { list: async () => (active ? [{ status: "running" }] : []) },
    threads: {
      getState: async () => ({
        next: paused ? ["tools"] : [],
        values: {
          files: {
            "/report.md": {
              content: [text],
              encoding,
              created_at: "2026-10-01T00:00:00Z",
            },
            "/other.md": "untouched",
          },
          source_image_attachments: source
            ? { image: { artifact_path: "/report.md" } }
            : {},
        },
      }),
      updateState: async (...args) => {
        if (fail) throw new Error("offline");
        writes.push(args);
      },
    },
  };
}
test("artifact edits write only one changed file to the live thread", async () => {
  assert.equal(editableTrialPath("/report.md"), true);
  assert.equal(editableTrialPath("/archive.zip"), false);
  assert.equal(editableTrialPath("/report.pdf"), false);
  const client = fileClient();
  await saveTrialFile(client, "thread", "/report.md", "original", "edited");
  const [thread, update] = client.writes[0];
  assert.equal(thread, "thread");
  assert.deepEqual(Object.keys(update.values.files), ["/report.md"]);
  const saved = update.values.files["/report.md"];
  assert.equal(saved.content, "edited");
  assert.equal(saved.encoding, "utf-8");
  assert.equal(saved.created_at, "2026-10-01T00:00:00Z");
  assert.ok(Number.isFinite(Date.parse(saved.modified_at)));
});
test("artifact edits reject stale files, active runs and source attachments", async () => {
  for (const options of [
    { active: true },
    { text: "changed elsewhere" },
    { source: true },
    { paused: true },
    { encoding: "base64" },
  ]) {
    const client = fileClient(options);
    await assert.rejects(
      saveTrialFile(client, "thread", "/report.md", "original", "edited")
    );
    assert.deepEqual(client.writes, []);
  }
  await assert.rejects(
    saveTrialFile(fileClient(), "thread", "/missing", "original", "edited")
  );
  await assert.rejects(
    saveTrialFile(
      fileClient({ fail: true }),
      "thread",
      "/report.md",
      "original",
      "edited"
    ),
    /offline/
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
