import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPolicyEdit,
  graphAttachmentMode,
  SOURCE_IMAGE_SOURCES,
  SOURCE_IMAGE_LABELS,
} from "../src/lib/source-images.ts";

const embeddedPolicy = {
  enabled: true,
  default_scope: "embedded",
  allow_all: false,
};

test("Graph is available in the shared admin, connectivity, and file source catalog", () => {
  assert(SOURCE_IMAGE_SOURCES.includes("graph"));
  assert.equal(SOURCE_IMAGE_LABELS.graph, "Microsoft Graph");
});

test("Graph attachment modes atomically enforce none, embedded only, or all", () => {
  const all = { enabled: true, default_scope: "all", allow_all: true };
  for (const [mode, expected] of [
    ["none", { enabled: false, default_scope: "embedded", allow_all: false }],
    ["embedded", embeddedPolicy],
    ["all", all],
  ]) {
    assert.deepEqual(
      applyPolicyEdit(all, { field: "attachment_mode", value: mode }),
      expected
    );
  }
});

test("older Graph policies remain distinct from all-attachment defaults", () => {
  const custom = { ...embeddedPolicy, allow_all: true };
  assert.equal(graphAttachmentMode(custom), "custom");
  assert.equal(graphAttachmentMode(embeddedPolicy), "embedded");
  assert.equal(graphAttachmentMode({ ...custom, enabled: false }), "none");
  const all = applyPolicyEdit(custom, {
    field: "attachment_mode",
    value: "all",
  });
  assert.equal(graphAttachmentMode(all), "all");
  assert.equal(all.default_scope, "all");
});

test("selecting all attachments also grants permission to request all", () => {
  assert.deepEqual(
    applyPolicyEdit(embeddedPolicy, {
      field: "default_scope",
      value: "all",
    }),
    { enabled: true, default_scope: "all", allow_all: true }
  );
});

test("revoking all-attachment permission restores the embedded default", () => {
  assert.deepEqual(
    applyPolicyEdit(
      { enabled: true, default_scope: "all", allow_all: true },
      { field: "allow_all", value: false }
    ),
    { enabled: true, default_scope: "embedded", allow_all: false }
  );
});

test("disabling a source preserves its configured scope and permission", () => {
  assert.deepEqual(
    applyPolicyEdit(
      { enabled: true, default_scope: "all", allow_all: true },
      { field: "enabled", value: false }
    ),
    { enabled: false, default_scope: "all", allow_all: true }
  );
});

test("enabling all-attachment permission does not change the embedded default", () => {
  assert.deepEqual(
    applyPolicyEdit(embeddedPolicy, { field: "allow_all", value: true }),
    { enabled: true, default_scope: "embedded", allow_all: true }
  );
});

test("editing an API response returns only the three writable policy fields", () => {
  assert.deepEqual(
    applyPolicyEdit(
      {
        tier: "developer",
        source: "jira",
        enabled: false,
        default_scope: "embedded",
        allow_all: false,
      },
      { field: "enabled", value: true }
    ),
    { enabled: true, default_scope: "embedded", allow_all: false }
  );
});
