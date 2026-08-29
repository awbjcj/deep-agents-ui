import { test } from "node:test";
import assert from "node:assert/strict";

import { filterShelves } from "../src/lib/library-shelf-view.ts";

function shelf(shelfId, overrides = {}) {
  return {
    shelf_id: shelfId,
    source_type: "local",
    index_name: `vsda_${shelfId}`,
    description: null,
    retention_enabled: false,
    retention_older_than: null,
    ...overrides,
  };
}

test("shelf filter matches searchable metadata case insensitively", () => {
  const shelves = [
    shelf("handbook", {
      source_type: "confluence",
      description: "Engineering reference",
    }),
    shelf("requirements", {
      index_name: "vsda_polarion_specs",
      source_type: "polarion",
    }),
  ];

  assert.deepEqual(filterShelves(shelves, "HANDBOOK"), [shelves[0]]);
  assert.deepEqual(filterShelves(shelves, "polarion_specs"), [shelves[1]]);
  assert.deepEqual(filterShelves(shelves, "engineering"), [shelves[0]]);
  assert.deepEqual(filterShelves(shelves, "polarion"), [shelves[1]]);
});

test("blank shelf filter preserves the complete list", () => {
  const shelves = [shelf("alpha"), shelf("beta")];
  assert.deepEqual(filterShelves(shelves, "  "), shelves);
});
