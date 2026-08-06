import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "../src/app/components/MarkdownContent.tsx";

/**
 * Renders assistant markdown exactly as the chat does. Server rendering resolves
 * lazy Prism to its Suspense fallback, so highlighted code blocks appear as the
 * plain block variant here — the surrounding structure is identical either way.
 */
function render(content) {
  return renderToStaticMarkup(
    React.createElement(MarkdownContent, { content })
  );
}

/** Extracts the LaTeX source KaTeX round-trips into its MathML annotation. */
function mathAnnotations(html) {
  return [
    ...html.matchAll(
      /<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g
    ),
  ].map((match) => match[1].trim());
}

// ── Math across provider dialects ──────────────────────────────────────────

test("renders OpenAI-style escaped delimiters as math", () => {
  const html = render(
    String.raw`The first \(n\) integers sum to \[ \frac{n(n+1)}{2} \]`
  );
  assert.deepEqual(mathAnnotations(html), ["n", String.raw`\frac{n(n+1)}{2}`]);
});

test("renders Anthropic/Gemini-style dollar delimiters as math", () => {
  const html = render("Inline $x^2$ and display:\n\n$$\n\\int_0^1 x\\,dx\n$$");
  assert.deepEqual(mathAnnotations(html), ["x^2", String.raw`\int_0^1 x\,dx`]);
});

test("renders bare LaTeX environments as display math", () => {
  const html = render(
    [String.raw`\begin{align}`, "a &= b", String.raw`\end{align}`].join("\n")
  );
  assert.match(html, /katex-display/);
  assert.equal(mathAnnotations(html).length, 1);
});

test("renders GFM math code fences as display math", () => {
  const html = render("```math\n\\frac{a}{b}\n```");
  assert.deepEqual(mathAnnotations(html), [String.raw`\frac{a}{b}`]);
});

// ── Literal characters that must not become formatting ─────────────────────

test("renders dunder identifiers literally instead of as bold", () => {
  const html = render("Open __init__.py and __pycache__/ now.");
  assert.match(html, /__init__\.py/);
  assert.match(html, /__pycache__\//);
  assert.doesNotMatch(html, /<strong>/);
});

test("renders dunder identifiers literally inside headings and tables", () => {
  assert.match(render("## __init__ and __main__"), /<h2>__init__ and __main__/);
  assert.match(render("| Method |\n| --- |\n| __init__ |"), />__init__</);
});

test("renders snake_case identifiers literally", () => {
  const html = render(
    "Fields customfield_10001, story_points_field and _private_var_."
  );
  assert.match(html, /customfield_10001/);
  assert.match(html, /story_points_field/);
  assert.match(html, /_private_var_/);
  assert.doesNotMatch(html, /<em>/);
});

test("still renders intentional emphasis", () => {
  const html = render("This is **bold**, *italic* and __also bold__.");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<strong>also bold<\/strong>/);
});

test("renders currency amounts literally instead of as math", () => {
  const html = render("It costs $5 and then $10 more.");
  assert.equal(mathAnnotations(html).length, 0);
  assert.match(html, /\$5 and then \$10 more\./);
});

// ── Code blocks ────────────────────────────────────────────────────────────

test("renders a single-line fence as a block rather than an inline chip", () => {
  const html = render("```\nnpm install\n```");
  assert.match(html, /<pre[^>]*>/);
  assert.match(html, /npm install/);
});

test("renders an indented code block as a block", () => {
  assert.match(render("    npm install"), /<pre[^>]*>/);
});

test("labels code blocks as focusable regions for keyboard scrolling", () => {
  const html = render("```js\nfoo();\n```");
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Code block \(js\)"/);
  assert.match(html, /tabindex="0"/i);
});

test("never rewrites math-like or emphasis-like text inside code", () => {
  const html = render(
    [
      "```python",
      "value = matrix[a=1]  # $5 and $10",
      "def __init__(self): ...",
    ]
      .join("\n")
      .concat("\n```")
  );
  assert.match(html, /matrix\[a=1\]/);
  assert.match(html, /\$5 and \$10/);
  assert.match(html, /__init__/);
  assert.equal(mathAnnotations(html).length, 0);
});

test("keeps inline code spans verbatim", () => {
  const html = render("Use `df[x == 1]` and `__init__` here.");
  assert.match(html, /<code[^>]*>df\[x == 1\]<\/code>/);
  assert.match(html, /<code[^>]*>__init__<\/code>/);
});

// ── Structural markdown ────────────────────────────────────────────────────

test("keeps footnote links in the current document", () => {
  const html = render("A claim[^1].\n\n[^1]: The note.");
  const footnoteLink = /<a href="#user-content-fn-1"[^>]*>/.exec(html);
  assert.ok(footnoteLink, "expected a footnote reference link");
  assert.doesNotMatch(footnoteLink[0], /target="_blank"/);
});

test("opens external links in a new tab safely", () => {
  const html = render("See [docs](https://example.com/a_b_c).");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/example\.com\/a_b_c"/);
});

test("drops links and images with unsafe URL schemes", () => {
  assert.doesNotMatch(render("[x](javascript:alert(1))"), /href=/);
  assert.doesNotMatch(render("![x](javascript:alert(1))"), /<img/);
});

test("renders task lists without doubling markers", () => {
  const html = render("- [ ] open\n- [x] closed");
  assert.match(html, /contains-task-list/);
  assert.match(html, /task-list-item/);
  assert.match(html, /type="checkbox"/);
});

test("renders strikethrough and horizontal rules", () => {
  assert.match(render("This is ~~gone~~."), /<del[^>]*>gone<\/del>/);
  assert.match(render("above\n\n---\n\nbelow"), /<hr[^>]*\/>/);
});

test("renders GFM tables as a labelled scrollable region", () => {
  const html = render("| a | b |\n| --- | --- |\n| 1 | 2 |");
  assert.match(html, /aria-label="Markdown table"/);
  assert.match(html, /<table/);
});
