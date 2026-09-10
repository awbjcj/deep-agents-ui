import test from "node:test";
import assert from "node:assert/strict";

import {
  credentialUpdate,
  scmFieldKey,
  scmServerSchema,
} from "../src/lib/scm.ts";
import { readFile } from "node:fs/promises";

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

test("the credential row is locked while its submitted secret is saving", async () => {
  const source = await readFile(
    new URL("../src/app/components/ScmCredentials.tsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.match(/disabled=\{busy\}/g)?.length, 3);
  assert.match(source, /disabled=\{busy \|\| !value\.token\.trim\(\)\}/);
  assert.match(source, /const busy = saving !== null/);
  assert.match(source, /const rowBusy = saving === server\.id/);
  assert.match(
    source,
    /server\.credential_state !== undefined &&[\s\S]*server\.credential_state !== "missing"/
  );
});

test("SCM server editing supports re-enable and locks the submitted form", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/admin/ScmServersSection.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /id="scm-server-enabled"/);
  assert.match(source, /onCheckedChange=\{\(enabled\)/);
  assert.match(source, /<fieldset[\s\S]*disabled=\{saving\}/);
});
