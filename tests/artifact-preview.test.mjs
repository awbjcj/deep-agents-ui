import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { FileContentView } from "../src/app/components/FileContentView.tsx";

import {
  conversationHistoryToMarkdown,
  defaultMarkdownViewMode,
  markdownPreviewContent,
  stripLineNumberGutter,
} from "../src/app/utils/artifactPreview.ts";

const HISTORY = [
  "## Summarized at 2026-09-24T16:29:32.835636+00:00",
  "",
  '<message type="human">READ-ONLY research &amp; triage.',
  "",
  "1. Find the projects.</message>",
  '<message type="ai">',
  '  <tool_call id="toolu_1" name="read_file">{"file_path": "/skills/polarion/SKILL.md", "limit": 1000}</tool_call>',
  "</message>",
  '<message type="tool">  1  ---',
  "  2  name: polarion-query-guide",
  "  3  ---",
  "  4  ",
  "  5  Escape `+ - &amp;&amp; ||` characters.</message>",
  '<message type="ai">Done: use `type:testCase AND status:Accepted`.</message>',
  "",
].join("\n");

test("strips a read_file line-number gutter and rejoins continuation chunks", () => {
  const result = stripLineNumberGutter(
    [
      " 9  alpha",
      "10  beta ",
      "10.1  continued",
      "11  ",
      "",
      "[truncated]",
    ].join("\n")
  );
  assert.equal(result.text, "alpha\nbeta continued\n\n\n[truncated]");
  assert.equal(result.firstLine, 9);
  assert.equal(result.lastLine, 11);
});

test("leaves content without a sequential gutter untouched", () => {
  for (const content of [
    "2024  was a year\nno gutter here",
    "1  one\n3  skipped",
    "1  one\nplain line in the middle\n2  two",
  ]) {
    assert.deepEqual(stripLineNumberGutter(content), {
      text: content,
      firstLine: null,
      lastLine: null,
    });
  }
});

test("rebuilds conversation history XML into a readable transcript", () => {
  const md = conversationHistoryToMarkdown(HISTORY);

  assert.doesNotMatch(md, /<\/?message\b/);
  assert.doesNotMatch(md, /&amp;/);
  assert.match(md, /^## Summarized at 2026-09-24/m);
  assert.match(md, /#### User\n\nREAD-ONLY research & triage\.\n\n1\. Find/);
  assert.match(md, /\*\*Tool call\*\* `read_file` · `toolu_1`/);
  assert.match(
    md,
    /```json\n\{\n {2}"file_path": "\/skills\/polarion\/SKILL\.md"/
  );
  // The tool result is paired with its call, keeps the source location, loses
  // the gutter, and is fenced so its front matter cannot become headings.
  assert.match(
    md,
    /#### Tool result · `read_file` · `\/skills\/polarion\/SKILL\.md` · lines 1–5\n\n```markdown\n---\nname: polarion-query-guide\n---\n\nEscape `\+ - && \|\|` characters\.\n```/
  );
  assert.match(
    md,
    /#### Assistant\n\nDone: use `type:testCase AND status:Accepted`\./
  );
});

test("renders a trailing message that was cut off before its closing tag", () => {
  const md = conversationHistoryToMarkdown(
    '<message type="human">hi</message>\n<message type="tool">  1  a\n  2  b'
  );
  assert.doesNotMatch(md, /<message/);
  assert.match(md, /#### Tool result · lines 1–2\n\n```\na\nb\n```$/);
});

test("renders reasoning and media references from AI content blocks", () => {
  const md = conversationHistoryToMarkdown(
    '<message type="ai"><reasoning>think &lt;hard&gt;</reasoning> See <image url="/conversation_history/media/a.png" /></message>'
  );
  assert.match(md, /> \*\*Reasoning\*\*\n>\n> think <hard>/);
  assert.match(md, /See \*\[image: \/conversation_history\/media\/a\.png\]\*/);
});

test("picks the viewer mode per artifact family", () => {
  const record =
    "Key: IKM-1150\nSummary: iACC set speed\nComments: 26\n---\nDescription:\nText";
  assert.equal(
    defaultMarkdownViewMode("/_artifacts/alice/t1/jira/120000_call.md", record),
    "source"
  );
  assert.equal(
    defaultMarkdownViewMode(
      "/_artifacts/alice/t1/confluence/120000_call.md",
      "# Page\n\nBody"
    ),
    "preview"
  );
  assert.equal(defaultMarkdownViewMode("notes/plan.md", record), "preview");
  assert.equal(
    defaultMarkdownViewMode(
      "/_artifacts/alice/t1/conversation_history/abc.md",
      HISTORY
    ),
    "preview"
  );
});

test("only conversation history previews are transformed", () => {
  assert.equal(markdownPreviewContent("notes/plan.md", "# Plan"), "# Plan");
  assert.notEqual(
    markdownPreviewContent(
      "/_artifacts/a/t/conversation_history/x.md",
      HISTORY
    ),
    HISTORY
  );
});

function renderFileView(path, content) {
  return renderToString(createElement(FileContentView, { path, content }));
}

function pressedModes(html) {
  return [
    ...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(\w+)</g),
  ]
    .filter(([, pressed]) => pressed === "true")
    .map(([, , label]) => label);
}

test("file viewer opens conversation history as a rebuilt transcript preview", () => {
  const html = renderFileView(
    "/_artifacts/alice/t1/conversation_history/abc.md",
    HISTORY
  );
  assert.deepEqual(pressedModes(html), ["Preview"]);
  assert.match(html, /Find the projects\./);
  assert.doesNotMatch(html, /&lt;message type=/);
});

test("file viewer opens plain-text tool records in source mode", () => {
  const record =
    "Key: IKM-1150\nSummary: iACC set speed\nComments: 26\n---\nDescription:\nText";
  const html = renderFileView(
    "/_artifacts/alice/t1/jira/120000_call.md",
    record
  );
  assert.deepEqual(pressedModes(html), ["Source"]);
  assert.match(html, /Key: IKM-1150/);
});
