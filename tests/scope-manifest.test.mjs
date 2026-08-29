import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergeScopeMembers,
  parseScopeManifest,
  roleAccessMembers,
} from "../src/lib/scope-manifest.ts";

test("parses and normalizes the existing YAML scope manifest shape", () => {
  assert.deepEqual(
    parseScopeManifest(`
scopes:
  - type: project
    id: VSDA
    display_name: VSDA Triage
    aliases: [vsda, triage, vsda]
    members:
      - {user: alice, access: write}
  - scope_type: feature
    scope_id: ACC
    default_access: read
`),
    [
      {
        scope_type: "project",
        scope_id: "VSDA",
        display_name: "VSDA Triage",
        aliases: ["vsda", "triage"],
        default_access: "tier",
        members: [{ username: "alice", access: "write" }],
      },
      {
        scope_type: "feature",
        scope_id: "ACC",
        display_name: null,
        aliases: [],
        default_access: "read",
        members: [],
      },
    ]
  );
});

test("accepts JSON because JSON is a YAML subset", () => {
  const scopes = parseScopeManifest(
    JSON.stringify({ scopes: [{ type: "vehicle", id: "X7" }] })
  );
  assert.equal(scopes[0].scope_id, "X7");
  assert.equal(scopes[0].default_access, "tier");
});

test("rejects duplicate scopes before any API calls can run", () => {
  assert.throws(
    () =>
      parseScopeManifest(`
scopes:
  - {type: project, id: VSDA}
  - {type: project, id: VSDA}
`),
    /duplicate scope project\/VSDA/
  );
});

test("rejects invalid access policies and member access", () => {
  assert.throws(
    () =>
      parseScopeManifest(
        "scopes: [{type: project, id: A, default_access: public}]"
      ),
    /default_access/
  );
  assert.throws(
    () =>
      parseScopeManifest(
        "scopes: [{type: project, id: A, members: [{user: alice, access: admin}]}]"
      ),
    /access must be read or write/
  );
});

test("requires a non-empty scopes list", () => {
  assert.throws(
    () => parseScopeManifest("scopes: []"),
    /non-empty scopes list/
  );
});

test("manifest members are additive and can update named grants", () => {
  assert.deepEqual(
    mergeScopeMembers(
      [
        { username: "existing", access: "read" },
        { username: "alice", access: "read" },
      ],
      [{ username: "alice", access: "write" }]
    ),
    [
      { username: "existing", access: "read" },
      { username: "alice", access: "write" },
    ]
  );
});

test("the role preset grants tier access without narrowing custom writes", () => {
  assert.deepEqual(
    roleAccessMembers(
      [{ username: "alice", access: "write" }],
      [
        { username: "alice", role: "user" },
        { username: "dev", role: "developer" },
        { username: "boss", role: "admin" },
      ]
    ),
    [
      { username: "alice", access: "write" },
      { username: "dev", access: "write" },
      { username: "boss", access: "write" },
    ]
  );
});
