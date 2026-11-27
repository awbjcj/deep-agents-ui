import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadRlDataset,
  rlExportFilters,
  rlPreviewText,
} from "../src/lib/rl-dataset.ts";

test("export intersects curation scope with every applied session filter", () => {
  const filters = {
    domain: "jira",
    tag: "precise_jql",
    min_score: 4,
    date_from: "2026-11-01",
    graph_id: "VSDA Deep Agent",
    model: "sample-model",
  };
  assert.deepEqual(rlExportFilters(filters, false), {
    ...filters,
    curation_status: "approved,unreviewed",
  });
  assert.deepEqual(rlExportFilters(filters, true), {
    ...filters,
    curation_status: "approved",
  });
  assert.deepEqual(
    rlExportFilters({ ...filters, curation_status: "unreviewed" }, false),
    { ...filters, curation_status: "unreviewed" }
  );
  assert.equal(
    rlExportFilters({ ...filters, curation_status: "unreviewed" }, true),
    null
  );
  assert.equal(
    rlExportFilters({ ...filters, curation_status: "excluded" }, false),
    null
  );
});

test("dynamic payload previews drop private keys at every depth and keep technical IDs", () => {
  const raw = {
    user_id: "private-id",
    vsda_team_mapping: { netid: "private-NetID" },
    files: [{ path: "relative/path.cpp", email: "owner@example.test" }],
    workItems: [
      {
        key: "VSDA-1234",
        displayName: "Private Name",
        threadId: "private-thread",
        actor: "[PERSON_1]",
      },
    ],
  };
  assert.deepEqual(JSON.parse(rlPreviewText(raw)), {
    files: [{ path: "relative/path.cpp" }],
    workItems: [{ key: "VSDA-1234", actor: "[PERSON_1]" }],
  });
});

test("JSONL export streams to a supported save target and preserves filename and query", async (t) => {
  const lines = [];
  const saved = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const requested = new URL(url, "https://example.test");
    assert.equal(requested.pathname, "/api/admin/rl-dataset/export");
    assert.deepEqual(Object.fromEntries(requested.searchParams), {
      format: "rl_samples",
      curation_status: "approved",
      model: "provider/example + v2",
    });
    assert.equal(options.headers.Accept, "application/x-ndjson");
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('{"score":5}\n'));
          controller.enqueue(encoder.encode('{"score":4}\n'));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } }
    );
  });
  globalThis.window = {
    localStorage: { getItem: () => null },
    showSaveFilePicker: async ({ suggestedName }) => {
      saved.push(suggestedName);
      return {
        createWritable: async () =>
          new WritableStream({
            write: (chunk) => lines.push(new TextDecoder().decode(chunk)),
          }),
      };
    },
  };
  try {
    await downloadRlDataset("rl_samples", {
      curation_status: "approved",
      model: "provider/example + v2",
    });
    assert.deepEqual(saved, ["rl_samples.jsonl"]);
    assert.deepEqual(lines, ['{"score":5}\n', '{"score":4}\n']);
  } finally {
    delete globalThis.window;
  }
});
