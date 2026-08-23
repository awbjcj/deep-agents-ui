import { test } from "node:test";
import assert from "node:assert/strict";

import {
  commonIndexPrefix,
  filterIndices,
  healthRank,
  sortIndices,
  summarizeIndices,
} from "../src/lib/library-index-view.ts";

function index(name, overrides = {}) {
  return {
    name,
    health: "green",
    status: "open",
    doc_count: 0,
    store_size_bytes: 0,
    primary_store_size_bytes: 0,
    ...overrides,
  };
}

test("filter matches on any part of the name, case insensitively", () => {
  const indices = [index("vsda_alpha"), index("vsda_BETA")];
  assert.deepEqual(
    filterIndices(indices, "beta").map((i) => i.name),
    ["vsda_BETA"]
  );
  assert.deepEqual(
    filterIndices(indices, "  ").map((i) => i.name),
    ["vsda_alpha", "vsda_BETA"]
  );
});

test("health sorts the indices that need an operator to the top", () => {
  assert.ok(healthRank("red") < healthRank("yellow"));
  assert.ok(healthRank("yellow") < healthRank("green"));
  assert.ok(healthRank("green") < healthRank("unrecognised"));
});

test("sorting is stable on the name and never mutates the input", () => {
  const indices = [
    index("b", { doc_count: 5 }),
    index("a", { doc_count: 5 }),
    index("c", { doc_count: 9 }),
  ];
  const original = indices.map((i) => i.name);

  assert.deepEqual(
    sortIndices(indices, "docs").map((i) => i.name),
    ["c", "a", "b"]
  );
  assert.deepEqual(
    sortIndices(indices, "name").map((i) => i.name),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    indices.map((i) => i.name),
    original
  );
});

test("size sorts largest first", () => {
  const indices = [
    index("small", { store_size_bytes: 10 }),
    index("large", { store_size_bytes: 1000 }),
  ];
  assert.deepEqual(
    sortIndices(indices, "size").map((i) => i.name),
    ["large", "small"]
  );
});

test("summary totals documents and bytes across the visible subset", () => {
  const totals = summarizeIndices([
    index("a", { doc_count: 3, store_size_bytes: 100 }),
    index("b", { doc_count: 4, store_size_bytes: 250 }),
  ]);
  assert.deepEqual(totals, { documents: 7, bytes: 350 });
});

test("shared prefix stops at a token boundary", () => {
  assert.equal(
    commonIndexPrefix(["vsda_library_alpha", "vsda_library_beta"]),
    "vsda_library_"
  );
});

test("shared prefix is withheld when it would hide more than it reveals", () => {
  // A single index has nothing to compare against.
  assert.equal(commonIndexPrefix(["vsda_library_alpha"]), "");
  // No shared token at all.
  assert.equal(commonIndexPrefix(["alpha", "beta"]), "");
  // Too short to be worth dimming.
  assert.equal(commonIndexPrefix(["a_one", "a_two"]), "");
  // The prefix swallows a whole name, which would render as a blank row.
  assert.equal(commonIndexPrefix(["vsda_library_", "vsda_library_alpha"]), "");
});
