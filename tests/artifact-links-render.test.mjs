import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "../src/app/components/MarkdownContent.tsx";
import { FileOpenerProvider } from "../src/app/components/FileOpener.tsx";
import { ReadableToolResult } from "../src/app/components/ReadableToolResult.tsx";

const CSV = "/_artifacts/u/t/a.csv";
const PNG = "/_artifacts/u/t/uploads/abc__name.png";
const files = {
  [CSV]: "h1,h2\n1,2",
  [PNG]: {
    content: "aW1hZ2U=",
    encoding: "base64",
    mime_type: "image/png",
    created_at: "",
    modified_at: "",
  },
};

function withOpener(element) {
  return renderToStaticMarkup(
    React.createElement(
      FileOpenerProvider,
      { files, sourceImageAttachments: {}, sourceAttachmentRecords: {} },
      element
    )
  );
}

test("with a file opener, artifact links open the viewer instead of downloading", () => {
  const markdown = React.createElement(MarkdownContent, {
    content: `[a.csv](${CSV})`,
    files,
  });
  const html = withOpener(markdown);
  assert.match(
    html,
    /<button[^>]*aria-label="Open a.csv"[^>]*>a.csv<\/button>/
  );
  assert.doesNotMatch(html, /Download a.csv/);
  // The inline spreadsheet preview waits for the browser to scroll it in.
  assert.doesNotMatch(html, /role="table"|Open full/);

  const plain = renderToStaticMarkup(markdown);
  assert.match(plain, /aria-label="Download a.csv"/);
  assert.doesNotMatch(plain, /Open a.csv/);
});

test("with a file opener, missing artifacts stay unavailable", () => {
  const html = withOpener(
    React.createElement(MarkdownContent, {
      content: "[gone](/_artifacts/u/t/gone.csv)",
      files,
    })
  );
  assert.match(html, /aria-label="Open gone.csv"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /file unavailable/);
});

test("with a file opener, artifact images are bounded thumbnails that open the viewer", () => {
  const html = withOpener(
    React.createElement(MarkdownContent, {
      content: `![Chart](${PNG})`,
      files,
    })
  );
  assert.match(html, /<button[^>]*aria-label="Open name.png"/);
  assert.match(html, /max-height:240px/);
  assert.match(html, /src="data:image\/png;base64,aW1hZ2U="/);
  assert.doesNotMatch(html, /Download|Expand/);
});

test("data URL images keep the raster allowlist", () => {
  const html = withOpener(
    React.createElement(MarkdownContent, {
      content:
        "![a](data:image/png;base64,aGk=) ![b](data:image/svg+xml;base64,aGk=)",
    })
  );
  assert.match(html, /src="data:image\/png;base64,aGk="/);
  assert.doesNotMatch(html, /svg\+xml/);
});

test("literal tool results link artifact paths only inside a chat", () => {
  const text = `Saved images:\n- name.png: <${PNG}> (source: jira; id 7)\n- other: /uploads/x.png`;
  const result = { kind: "text", text, monospace: true };
  const html = withOpener(
    React.createElement(ReadableToolResult, { result, files })
  );
  assert.match(
    html,
    new RegExp(
      `&lt;<button[^>]*title="Open name.png"[^>]*>${PNG}</button>&gt; \\(source: jira; id 7\\)`
    )
  );
  assert.match(html, /- other: \/uploads\/x.png/);

  const missing = withOpener(
    React.createElement(ReadableToolResult, {
      result: {
        kind: "text",
        text: "/_artifacts/u/t/gone.png",
        monospace: false,
      },
      files,
    })
  );
  assert.doesNotMatch(missing, /<button/);

  const plain = renderToStaticMarkup(
    React.createElement(ReadableToolResult, { result, files })
  );
  assert.doesNotMatch(plain, /<button/);
  assert.match(plain, /&lt;\/_artifacts\/u\/t\/uploads\/abc__name.png&gt;/);
});

test("linked artifact images keep exactly one interactive target", () => {
  for (const destination of [CSV, "https://example.com/report"]) {
    const element = React.createElement(MarkdownContent, {
      content: `[![Chart](${PNG})](${destination})`,
      files,
    });
    for (const html of [withOpener(element), renderToStaticMarkup(element)]) {
      assert.equal((html.match(/<(?:button|a) /g) || []).length, 1);
      assert.match(html, /alt="Chart"/);
      assert.doesNotMatch(html, /aria-label="Open name.png"/);
    }
  }
});
