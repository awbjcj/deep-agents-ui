import assert from "node:assert/strict";
import test from "node:test";
import { parseToolEvidence, evidenceDraft } from "../src/lib/tool-evidence.ts";
import { parseLlmWikiPage } from "../src/lib/llm-wiki-page.ts";

const search =
  "LLM Wiki search for 'rope embedding' (project current, mode hybrid, 2 result(s)). Scores are only comparable within this response.\n\n1. RoPE embedding\n   path: wiki/concepts/rope.md\n   score: 0.0325, vector similarity 0.81, title match\n   snippet: Rotary position embedding encodes...\n   images: img/a.png\n\n2. wiki/notes/x.md\n   path: wiki/notes/x.md\n   score: 0.0161";

test("LLM Wiki search hits become citable evidence cards", () => {
  const items = parseToolEvidence("search_llm_wiki", search);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "RoPE embedding");
  assert.equal(items[0].excerpt, "Rotary position embedding encodes...");
  assert.match(items[0].metadata, /path: wiki\/concepts\/rope\.md/);
  assert.match(items[0].metadata, /mode: hybrid/);
  assert.match(items[0].metadata, /project: current/);
  assert.equal(items[0].url, undefined);
  assert.equal(items[1].title, "wiki/notes/x.md");
  assert.equal(items[1].excerpt, "(no snippet)");
  assert.match(evidenceDraft([items[0]]), /wiki\/concepts\/rope\.md/);
  assert.equal(
    parseToolEvidence("search_llm_wiki", search.replaceAll("\n", "\r\n"))
      .length,
    2
  );
});

test("LLM Wiki errors and empty searches keep generic rendering", () => {
  for (const value of [
    null,
    "LLM Wiki is not configured for this deployment (LLM_WIKI_API_URL is unset).",
    "Error searching LLM Wiki for 'x': LLM Wiki request failed (HTTP 401)",
    "LLM Wiki search for 'x' (project current, mode keyword, 0 result(s)). Scores are only comparable within this response.\nNo matching wiki pages found.",
    "x".repeat(200_001),
  ]) {
    assert.deepEqual(parseToolEvidence("search_llm_wiki", value), []);
  }
  assert.deepEqual(parseToolEvidence("search_database", search), []);
});

test("LLM Wiki page reads expose Markdown and truncation", () => {
  const page = parseLlmWikiPage(
    "read_llm_wiki_page",
    "LLM Wiki page wiki/concepts/rope.md (project current)\n\n# RoPE\n\n- item\n\n[Truncated at 12000 characters; pass full_content=True for the complete page.]"
  );
  assert.deepEqual(page, {
    path: "wiki/concepts/rope.md",
    project: "current",
    markdown: "# RoPE\n\n- item",
    truncatedAt: 12000,
  });
  const full = parseLlmWikiPage(
    "read_llm_wiki_page",
    "LLM Wiki page purpose.md (project a0e9)\n\nBody"
  );
  assert.equal(full?.markdown, "Body");
  assert.equal(full?.truncatedAt, undefined);
  assert.equal(
    parseLlmWikiPage("read_llm_wiki_page", "Error reading LLM Wiki page"),
    null
  );
  assert.equal(parseLlmWikiPage("search_llm_wiki", "LLM Wiki page x"), null);
});

test("LLM Wiki page reads drop the saved source-image summary", () => {
  const page = parseLlmWikiPage(
    "read_llm_wiki_page",
    "LLM Wiki page wiki/sources/a.md (project p1)\n\n# A\n![d](../media/a/1.png)\n\n[Truncated at 20 characters; pass full_content=True for the complete page.]\n\nSource images: 1 saved, 1 skipped (external_origin=1).\n\nSaved source images (use these task file paths to inspect images when needed):\n- 1.png: </t/uploads/abc__1.png> (source: llm_wiki; item: wiki/sources/a.md; attachment: wiki/media/a/1.png; optimized image copy)"
  );
  assert.equal(page?.markdown, "# A\n![d](../media/a/1.png)");
  assert.equal(page?.truncatedAt, 20);
  const skippedOnly = parseLlmWikiPage(
    "read_llm_wiki_page",
    "LLM Wiki page wiki/a.md (project p1)\n\nBody\n\nSource images: 0 saved, 1 skipped (missing=1)."
  );
  assert.equal(skippedOnly?.markdown, "Body");
});
