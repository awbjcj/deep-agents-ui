import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPolicyEdit,
  SOURCE_IMAGE_SOURCES,
  SOURCE_IMAGE_LABELS,
} from "../src/lib/source-images.ts";

const embeddedPolicy = {
  enabled: true,
  documents_enabled: false,
  default_scope: "embedded",
  allow_all: false,
};

test("Graph is available in the shared admin, connectivity, and file source catalog", () => {
  assert(SOURCE_IMAGE_SOURCES.includes("graph"));
  assert.equal(SOURCE_IMAGE_LABELS.graph, "Microsoft Graph");
  assert(SOURCE_IMAGE_SOURCES.includes("llm_wiki"));
  assert.equal(SOURCE_IMAGE_LABELS.llm_wiki, "LLM Wiki");
});

test("image and document switches preserve each other's permissions and scope", () => {
  const documents = applyPolicyEdit(embeddedPolicy, {
    field: "documents_enabled",
    value: true,
  });
  assert.deepEqual(documents, { ...embeddedPolicy, documents_enabled: true });
  assert.deepEqual(
    applyPolicyEdit(documents, { field: "enabled", value: false }),
    {
      ...documents,
      enabled: false,
    }
  );
  assert.deepEqual(
    applyPolicyEdit(documents, { field: "documents_enabled", value: false }),
    embeddedPolicy
  );
});

test("selecting all attachments also grants permission to request all", () => {
  assert.deepEqual(
    applyPolicyEdit(embeddedPolicy, {
      field: "default_scope",
      value: "all",
    }),
    {
      enabled: true,
      documents_enabled: false,
      default_scope: "all",
      allow_all: true,
    }
  );
});

test("revoking all-attachment permission restores the embedded default", () => {
  assert.deepEqual(
    applyPolicyEdit(
      { enabled: true, default_scope: "all", allow_all: true },
      { field: "allow_all", value: false }
    ),
    {
      enabled: true,
      documents_enabled: false,
      default_scope: "embedded",
      allow_all: false,
    }
  );
});

test("disabling a source preserves its configured scope and permission", () => {
  assert.deepEqual(
    applyPolicyEdit(
      { enabled: true, default_scope: "all", allow_all: true },
      { field: "enabled", value: false }
    ),
    {
      enabled: false,
      documents_enabled: false,
      default_scope: "all",
      allow_all: true,
    }
  );
});

test("enabling all-attachment permission does not change the embedded default", () => {
  assert.deepEqual(
    applyPolicyEdit(embeddedPolicy, { field: "allow_all", value: true }),
    {
      enabled: true,
      documents_enabled: false,
      default_scope: "embedded",
      allow_all: true,
    }
  );
});

test("editing a legacy response returns only writable fields and defaults documents off", () => {
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
    {
      enabled: true,
      documents_enabled: false,
      default_scope: "embedded",
      allow_all: false,
    }
  );
});
