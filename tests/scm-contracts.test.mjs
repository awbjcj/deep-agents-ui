import test from "node:test";
import assert from "node:assert/strict";

import {
  credentialStateText,
  credentialUpdate,
  partitionScmServers,
  scmFieldKey,
  scmServerSchema,
} from "../src/lib/scm.ts";
import { readFile } from "node:fs/promises";

test("a Gerrit credential requires its Basic-auth login name", () => {
  assert.throws(
    () => credentialUpdate("test-pat", "  ", "gerrit"),
    /Gerrit login name/
  );
  assert.deepEqual(credentialUpdate("test-pat", "alice", "gerrit"), {
    token: "test-pat",
    username: "alice",
  });
  assert.deepEqual(credentialUpdate("test-pat", "", "plastic"), {
    token: "test-pat",
  });
});

test("credential states explain validation and server changes", () => {
  assert.equal(credentialStateText(undefined).label, "not connected");
  assert.equal(credentialStateText("missing").label, "not connected");
  assert.match(credentialStateText("unvalidated").hint ?? "", /Code Analyzer/);
  assert.match(
    credentialStateText("reconnect_required").label,
    /save token again/
  );
  assert.equal(credentialStateText("validated").label, "validated");
});

test("disabled SCM servers are listed separately from enabled ones", () => {
  const { active, disabled } = partitionScmServers([
    { id: "a", enabled: true },
    { id: "b", enabled: false },
  ]);
  assert.deepEqual(
    active.map((s) => s.id),
    ["a"]
  );
  assert.deepEqual(
    disabled.map((s) => s.id),
    ["b"]
  );
});

test("editing an SCM server keeps its ID and cannot create a duplicate", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/admin/ScmServersSection.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /readOnly=\{field === "id" && editingId !== null\}/);
  assert.match(source, /editingId \? \{ \.\.\.draft, id: editingId \} : draft/);
  assert.match(source, /already exists\. Use Edit or Restore instead/);
  assert.match(source, /Restore \$\{server\.display_name\}/);
});

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

  assert.equal(source.match(/disabled=\{busy\}/g)?.length, 2);
  assert.match(
    source,
    /disabled=\{\s*busy \|\| !canSave \|\| result\?\.status === "testing"\s*\}/
  );
  assert.match(source, /const busy = pending !== null/);
  assert.match(
    source,
    /!!server\.credential_state && server\.credential_state !== "missing"/
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

test("GitLab servers accept per-user credentials and source selections", async () => {
  const { sourceChoice, workspaceResumeSchema } =
    await import("../src/lib/code-workspace.ts");
  assert.equal(
    scmServerSchema.parse({
      id: "gl",
      provider: "gitlab",
      display_name: "GitLab",
      enabled: true,
      generation: 1,
    }).provider,
    "gitlab"
  );
  assert.throws(
    () => credentialUpdate("pat", "", "gitlab"),
    /GitLab login name/
  );
  assert.deepEqual(credentialUpdate("pat", "alice", "gitlab"), {
    token: "pat",
    username: "alice",
  });
  assert.equal(
    sourceChoice({ ref: "refs/heads/main" }, "branches", "gitlab").selector,
    "refs/heads/main"
  );
  assert.equal(
    sourceChoice({ revision: "a".repeat(40) }, "commits", "gitlab").selector,
    "a".repeat(40)
  );
  assert.deepEqual(
    sourceChoice(
      {
        revision: "a".repeat(40),
        title: "Fix login retry",
        message: "Fix login retry\n\nLonger body",
      },
      "commits",
      "gitlab"
    ),
    {
      label: "Fix login retry",
      selector: "a".repeat(40),
      detail: "aaaaaaaaaaaa",
    }
  );
  assert.equal(
    workspaceResumeSchema.parse({
      prepareId: "job",
      targets: [
        {
          ref: { server_id: "gl", repository: "team/repo" },
          provider: "gitlab",
          revision: "a".repeat(40),
          selector: "main",
        },
      ],
    }).targets[0].provider,
    "gitlab"
  );
});
