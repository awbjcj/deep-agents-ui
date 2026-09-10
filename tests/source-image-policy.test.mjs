import assert from "node:assert/strict";
import test from "node:test";

import { applyPolicyEdit } from "../src/lib/source-images.ts";

const embeddedPolicy = {
  enabled: true,
  default_scope: "embedded",
  allow_all: false,
};

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
