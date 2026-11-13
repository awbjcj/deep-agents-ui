import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpreadsheetView } from "../src/app/components/SpreadsheetView.tsx";
import { PdfView } from "../src/app/components/PdfView.tsx";

const render = (props) =>
  renderToStaticMarkup(React.createElement(SpreadsheetView, props));

test("spreadsheet cells render as text, never as markup", () => {
  const html = render({
    file: {
      path: "/_artifacts/u/t/a.csv",
      content: 'name,html\nx,"<b>bold</b><img src=x onerror=alert(1)>"',
    },
  });
  assert.match(html, /<table/);
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>|<img/);
  // The first row is the sticky, sortable header.
  assert.match(html, /<th[^>]*aria-sort="none"[^>]*><button/);
  assert.match(html, /sticky/);
  assert.doesNotMatch(html, /role="status"/);
});

test("the full viewer caps rows and explains the truncation", () => {
  const content = Array.from({ length: 1002 }, (_, row) => `${row},v`).join(
    "\n"
  );
  const html = render({ file: { path: "/_artifacts/u/t/big.csv", content } });
  assert.match(html, /role="status"/);
  assert.match(html, /1,000 of 1,002 rows/);
  assert.equal((html.match(/<tr/g) || []).length, 1000);
});

test("the compact preview shows 8 by 8 cells of the first sheet without tabs", () => {
  const content = Array.from({ length: 20 }, (_, row) =>
    Array.from({ length: 12 }, (_, column) => `r${row}c${column}`).join(",")
  ).join("\n");
  const html = render({
    file: { path: "/_artifacts/u/t/wide.csv", content },
    compact: true,
  });
  assert.match(html, /r7c7/);
  assert.doesNotMatch(html, /r8c0|r0c8/);
  assert.doesNotMatch(html, /aria-pressed/);
  // Compact previews sit inside paragraphs, so they avoid block elements.
  assert.doesNotMatch(html, /<(div|table|p)[ >]/);
  assert.match(html, /role="table"/);
  assert.match(html, /8 of 20 rows/);
  assert.match(html, /8 of 12 columns/);
  assert.match(html, /tabindex="0"/);
});

test("base64 CSV originals decode as UTF-8 text", () => {
  const html = render({
    file: {
      path: "/_artifacts/u/t/source-attachments/k__data.csv",
      content: Buffer.from("größe,wert\nä,1").toString("base64"),
      encoding: "base64",
    },
  });
  assert.match(html, /größe/);
});

test("workbooks wait for the lazy parser instead of rendering on the server", () => {
  const html = render({
    file: {
      path: "/_artifacts/u/t/book.xlsx",
      content: "UEsDBA==",
      encoding: "base64",
    },
  });
  assert.match(html, /Loading spreadsheet/);
  assert.doesNotMatch(html, /<table/);
});

test("PDF previews mount a blob URL only in the browser", () => {
  const html = renderToStaticMarkup(
    React.createElement(PdfView, { content: "JVBERi0=", title: "a.pdf" })
  );
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /Loading PDF/);
});

test("content that is not a PDF never reaches a frame", () => {
  for (const content of [
    Buffer.from("<html><script>alert(1)</script></html>").toString("base64"),
    "not base64 at all!",
    "",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(PdfView, { content, title: "a.pdf" })
    );
    assert.doesNotMatch(html, /<iframe|Loading PDF/);
    assert.match(html, /A preview is not available/);
  }
});

test("empty compact sheets explain their state", () => {
  const html = render({
    file: { path: "empty.csv", content: "" },
    compact: true,
  });
  assert.match(html, /This sheet is empty/);
  assert.doesNotMatch(html, /role="table"/);
});

test("unnamed columns have usable sort controls", () => {
  const html = render({
    file: { path: "blank-header.csv", content: ",value\na,1" },
  });
  assert.match(html, /Column 1/);
});
