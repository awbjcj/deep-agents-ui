import test from "node:test";
import assert from "node:assert/strict";

import {
  credentialUpdate,
  scmFieldKey,
  scmServerSchema,
} from "../src/lib/scm.ts";

test("an untouched SCM token is not submitted as an empty replacement", () => {
  assert.throws(() => credentialUpdate("", "alice"), /personal access token/);
  assert.deepEqual(credentialUpdate("test-pat", " alice "), {
    token: "test-pat",
    username: "alice",
  });
});

test("each dynamic SCM server gets an isolated focus key", () => {
  assert.equal(scmFieldKey("gerrit-primary"), "scm:gerrit-primary");
  assert.notEqual(scmFieldKey("gerrit-primary"), scmFieldKey("plastic"));
});

test("personal server metadata retains only the public readiness bit", () => {
  const server = scmServerSchema.parse({
    id: "gerrit-primary",
    provider: "gerrit",
    display_name: "Gerrit",
    enabled: true,
    generation: 1,
    credential_state: "unvalidated",
    validation: {
      ready: false,
      endpoint: "https://operator-only.example",
      blockers: ["profile internals"],
    },
  });

  assert.deepEqual(server.validation, { ready: false });
});
