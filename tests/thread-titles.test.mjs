import assert from "node:assert/strict";
import test from "node:test";
import { deriveMeta } from "../src/app/hooks/useThreads.ts";

function thread(metadata, content) {
  return {
    thread_id: crypto.randomUUID(),
    updated_at: "2026-01-01T00:00:00Z",
    metadata,
    values: { messages: [{ type: "human", content }] },
  };
}

test("generated titles display in full and manual titles take precedence", () => {
  const generated =
    "Investigate the brake warning indicator in release validation logs";
  assert.equal(
    deriveMeta(thread({ title: generated }, "prompt")).title,
    generated
  );
  assert.equal(
    deriveMeta(
      thread({ title: generated, custom_name: "My investigation" }, "prompt")
    ).title,
    "My investigation"
  );
});

test("fallback titles do not append ellipses or cut words", () => {
  const prompt =
    "Investigate the brake warning indicator and compare vehicle logs across the release validation recordings";
  const title = deriveMeta(thread({}, prompt)).title;
  assert.ok(title.length > 50);
  assert.ok(prompt.startsWith(title));
  assert.ok(!title.endsWith("..."));
  assert.ok(title.length === prompt.length || prompt[title.length] === " ");
});

test("fallback titles keep whole prefixes without spaces or at word ends", () => {
  const cjk = "分析".repeat(60);
  assert.equal(deriveMeta(thread({}, cjk)).title, cjk.slice(0, 100));
  const wordEnd = `${"a".repeat(50)} ${"b".repeat(49)} tail`;
  assert.equal(deriveMeta(thread({}, wordEnd)).title, wordEnd.slice(0, 100));
});
