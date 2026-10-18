import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileContentView } from "../src/app/components/FileContentView.tsx";
import { jsonFilePreview } from "../src/lib/json-file-preview.ts";
import { FILE_PREVIEW_CHARACTERS } from "../src/lib/file-preview.ts";

test("JSON formatting preserves numeric precision, key order and string escapes", () => {
  const source = String.raw`{"10":9223372036854775807,"2":1e+30,"10":-0,"text":"Quotes: \"hi\", slash: \\, newline: \n, braces: [{,}], unicode: \u0041","empty":[{},[]],"ok":true,"value":null}`;
  const result = jsonFilePreview(source);
  assert.equal(
    result.text,
    String.raw`{
  "10": 9223372036854775807,
  "2": 1e+30,
  "10": -0,
  "text": "Quotes: \"hi\", slash: \\, newline: \n, braces: [{,}], unicode: \u0041",
  "empty": [
    {},
    []
  ],
  "ok": true,
  "value": null
}`
  );
  assert.equal(result.truncated, false);
  assert.equal(result.invalid, false);
});

test("JSON formatting accepts primitives and already formatted content", () => {
  for (const content of ['"hello"', "42", "false", "null", "[]", "{}"]) {
    assert.equal(jsonFilePreview(content).text, content);
  }
  const formatted = '{\n  "hello": [\n    "world"\n  ]\n}';
  assert.equal(jsonFilePreview(formatted).text, formatted);
});

test("invalid and incomplete JSON remain readable as the original source", () => {
  for (const content of ['{"messages":[', '{"a":1,}', "", "not JSON"]) {
    assert.deepEqual(jsonFilePreview(content), {
      text: content,
      truncated: false,
      invalid: true,
    });
  }
});

test("large single-line histories are formatted within the preview budget", () => {
  const result = jsonFilePreview(
    '{"messages":[' +
      '{"role":"user","content":"A conversation entry"},'.repeat(5000) +
      '{"content":"DOCUMENT_END"}]}'
  );
  assert.ok(result.text.startsWith('{\n  "messages": [\n    {'));
  assert.ok(result.text.length <= FILE_PREVIEW_CHARACTERS);
  assert.ok(!result.text.includes("DOCUMENT_END"));
  assert.equal(result.truncated, true);
  assert.equal(result.invalid, false);
});

test("indentation expansion and deep nesting are bounded even for short inputs", () => {
  for (const content of [
    `[${"0,".repeat(20000)}0]`,
    "[".repeat(10000) + "0" + "]".repeat(10000),
  ]) {
    assert.ok(content.length < FILE_PREVIEW_CHARACTERS);
    const result = jsonFilePreview(content);
    assert.ok(result.text.length <= FILE_PREVIEW_CHARACTERS);
    assert.equal(result.truncated, true);
  }
});

test("formatted previews never split an emoji at the output boundary", () => {
  const prefix = '{\n  "text": "';
  const result = jsonFilePreview(
    '{"text":"' +
      "x".repeat(FILE_PREVIEW_CHARACTERS - prefix.length - 1) +
      '😀tail"}'
  );
  assert.equal(result.truncated, true);
  assert.equal(result.text.isWellFormed(), true);
});

test("conversation history JSON opens with readable indentation", () => {
  const html = renderToStaticMarkup(
    React.createElement(FileContentView, {
      path: "/conversation_history/session.json",
      content: '{"messages":[{"role":"user","content":"Hello"}],"count":1}',
    })
  );
  assert.ok(html.includes("{\n  &quot;messages&quot;: [\n    {"));
  assert.match(html, /aria-pressed="true"[^>]*>Formatted<\/button>/);
  assert.match(html, />Source<\/button>/);
});
