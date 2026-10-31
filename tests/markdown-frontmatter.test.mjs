import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "../src/app/components/MarkdownContent.tsx";
import { splitFrontmatter } from "../src/lib/frontmatter.ts";

const WIKI_PAGE =
  "---\ntitle: Attention\ntags: [deep-learning, transformer]\nrelated: [[rope]]\nupdated: 2026-10-30\n---\n\n# Attention\n\nBody text.";

function renderDocument(content, mode = "document") {
  return renderToStaticMarkup(
    React.createElement(MarkdownContent, { content, mode })
  );
}

test("splits leading YAML frontmatter from the Markdown body", () => {
  const { frontmatter, body } = splitFrontmatter(WIKI_PAGE);
  assert.deepEqual(frontmatter, {
    entries: [
      ["title", "Attention"],
      ["tags", ["deep-learning", "transformer"]],
      ["related", ["[[rope]]"]],
      ["updated", "2026-10-30"],
    ],
  });
  assert.equal(body, "\n# Attention\n\nBody text.");
});

test("repairs unbracketed wikilink lists and keeps invalid YAML as raw text", () => {
  const repaired = splitFrontmatter(
    "---\nrelated: [[a]], [[b]]\n---\nBody"
  ).frontmatter;
  assert.deepEqual(repaired, { entries: [["related", ["[[a]]", "[[b]]"]]] });

  const invalid = splitFrontmatter("---\ntitle: [unclosed\n---\nBody");
  assert.deepEqual(invalid.frontmatter, { raw: "title: [unclosed" });
  assert.equal(invalid.body, "Body");
});

test("leaves documents without top-of-file frontmatter untouched", () => {
  for (const content of [
    "# Title\n\n---\n\nkey: value\n---\n",
    "---\n\nJust a rule then text\n",
    "---\nA plain paragraph\n---\n",
  ]) {
    assert.deepEqual(splitFrontmatter(content), {
      frontmatter: null,
      body: content,
    });
  }
});

test("document mode renders frontmatter as metadata, not a setext heading", () => {
  const html = renderDocument(WIKI_PAGE);
  assert.doesNotMatch(html, /<h2[ >]/);
  assert.doesNotMatch(html, /<hr[ />]/);
  assert.match(html, /<dl[^>]*aria-label="Document metadata"/);
  assert.match(html, /<dt[^>]*>title<\/dt>\s*<dd[^>]*>Attention<\/dd>/);
  assert.match(html, />transformer</);
  assert.match(html, /<h1[^>]*>Attention<\/h1>/);
});

test("assistant mode does not reinterpret leading rules", () => {
  assert.doesNotMatch(renderDocument(WIKI_PAGE, "assistant"), /<dl/);
});
