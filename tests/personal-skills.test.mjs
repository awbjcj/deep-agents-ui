import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SCHEMA, Type, load } from "js-yaml";
import * as api from "../src/lib/skills.ts";
import * as drafts from "../src/lib/skill-drafts.ts";
import {
  SkillFileList,
  SkillFilePreview,
} from "../src/app/components/skills/SkillFileList.tsx";
import { SkillEditor } from "../src/app/components/skills/SkillEditor.tsx";
import { SkillDetails } from "../src/app/components/skills/SkillDetails.tsx";

const limits = {
  skill_file_bytes: 65536,
  supporting_file_bytes: 524288,
  package_bytes: 2097152,
  files_per_package: 100,
  skills_per_account: 50,
  account_text_bytes: 10485760,
  upload_bytes: 2097152,
  path_characters: 240,
  path_segments: 8,
  name_characters: 64,
  description_characters: 1024,
  worker_request_bytes: 524288,
  broker_response_bytes: 2097152,
  snapshot_chunk_bytes: 131072,
};
const root = {
  path: "SKILL.md",
  content:
    "---\nname: original\ndescription: A description\nlicense: MIT\nmetadata:\n  owner: team\n  enabled: true\n---\n# Instructions\nRead resources/help.txt.\n",
};
const files = [
  root,
  { path: "resources/help.txt", content: "Keep this file\n" },
];
const saved = {
  id: "p1",
  name: "original",
  description: "A description",
  files,
  revision: 3,
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("API replacement carries a revision but no owner", async (t) => {
  let sentBody;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/skills/personal/p1");
    assert.equal(init.method, "PUT");
    sentBody = JSON.parse(init.body);
    return json(
      {
        detail: {
          code: "skill_revision_conflict",
          message: "Reload before saving",
          diagnostics: [
            {
              code: "conflict",
              message: "Changed elsewhere",
              path: "SKILL.md",
            },
          ],
        },
      },
      409
    );
  });
  const draft = drafts.createSkillDraft("account-1", saved);
  const conflict = await api
    .apiReplacePersonalSkill("p1", { ...draft, account_id: "never-send" }, 3)
    .catch((e) => e);
  assert.equal(sentBody.expected_revision, 3);
  assert.equal(Object.hasOwn(sentBody, "account_id"), false);
  assert.deepEqual(Object.keys(sentBody).sort(), [
    "expected_revision",
    "files",
  ]);
  assert.deepEqual(sentBody.files, draft.files);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, "skill_revision_conflict");
  assert.equal(conflict.diagnostics[0].path, "SKILL.md");
});

test("client creates only files, encodes IDs and paths, propagates abort, and consumes empty DELETE", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push([url, init]);
    return init.method === "DELETE"
      ? new Response(null, { status: 204 })
      : json(saved);
  });
  await api.apiCreatePersonalSkill({ files, account_id: "never-send" });
  assert.deepEqual(JSON.parse(requests[0][1].body), { files });
  const signal = new AbortController().signal;
  await api.apiGetSkills(signal);
  await api.apiGetPersonalSkill("a/b", signal);
  await api.apiGetSystemSkill("a/b", signal);
  await api.apiReadSystemSkillFile("a/b", "refs/a #.md", signal);
  assert.deepEqual(
    requests.slice(1).map(([u]) => u),
    [
      "/api/skills",
      "/api/skills/personal/a%2Fb",
      "/api/skills/system/a%2Fb",
      "/api/skills/system/a%2Fb/file?path=refs%2Fa%20%23.md",
    ]
  );
  assert.ok(requests.slice(1).every(([, init]) => init.signal === signal));
  assert.equal(await api.apiDeletePersonalSkill("p1", 3), undefined);
  assert.equal(
    requests.at(-1)[0],
    "/api/skills/personal/p1?expected_revision=3"
  );
  assert.equal(requests.at(-1)[1].body, undefined);
});

test("multipart imports let the browser set a boundary and send exactly one file", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/skills/import/preview");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).has("content-type"), false);
    assert.ok(init.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], ["file"]);
    return json({
      package: {
        name: "original",
        description: "A description",
        files,
        total_bytes: 123,
      },
      diagnostics: [],
    });
  });
  const result = await api.apiPreviewSkillImport(
    new File([root.content], "SKILL.md")
  );
  assert.deepEqual(result.package.files, files);
});

test("client tolerates established authentication and non-JSON error shapes", async (t) => {
  let response = json({ detail: "Sign in again" }, 401);
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(
    api.apiGetSkills(),
    (e) => e.status === 401 && e.message === "Sign in again"
  );
  response = new Response("upstream html", { status: 502 });
  await assert.rejects(
    api.apiGetSkills(),
    (e) =>
      e.status === 502 &&
      e.code === "skills_request_failed" &&
      !e.message.includes("upstream html")
  );
});

test("draft copies are independent, use a distinct name, and preserve unknown metadata and all resources", () => {
  const draft = drafts.copySystemSkillDraft(
    "account-1",
    files,
    "original-copy"
  );
  assert.equal(draft.sourceId, null);
  assert.equal(draft.baseRevision, null);
  assert.equal(drafts.isSkillDraftDirty(draft), true);
  assert.deepEqual(
    draft.files.map((f) => f.path),
    files.map((f) => f.path)
  );
  assert.deepEqual(draft.files[1], files[1]);
  const metadata = load(draft.files[0].content.split("---")[1]);
  assert.equal(metadata.name, "original-copy");
  assert.deepEqual(metadata.metadata, { owner: "team", enabled: true });
  assert.equal(metadata.license, "MIT");
  assert.equal(
    draft.files[0].content.split("---")[2],
    root.content.split("---")[2]
  );
  assert.throws(
    () => drafts.copySystemSkillDraft("account-1", files, "original"),
    /distinct/i
  );
  assert.throws(
    () => drafts.copySystemSkillDraft("account-1", files, "Invalid Name"),
    /name/i
  );
  assert.equal(files[0].content, root.content);
});

// Match PyYAML SafeLoader's supported legacy booleans and tagged sets for these regressions.
const backendMetadataSchema = DEFAULT_SCHEMA.extend({
  implicit: [
    new Type("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: (value) => /^(?:yes|no|true|false|on|off)$/i.test(value ?? ""),
      construct: (value) => /^(?:yes|true|on)$/i.test(value),
    }),
  ],
  explicit: [
    new Type("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: (value) =>
        value !== null && Object.values(value).every((item) => item === null),
      construct: (value) => new Set(Object.keys(value)),
    }),
  ],
});

test("copies preserve backend YAML scalar and tag semantics in supported frontmatter shapes", () => {
  const extra =
    "metadata: {enabled: off, affirmative: yes, allowed: !!set {one: null, two: null}, name: original}";
  const shapes = [
    `name: original # Keep this comment\ndescription: A description\n${extra}\n`,
    `{"name": "original", description: A description, ${extra}}\n`,
    `!!map\n? !!str name\n: !!str original\ndescription: A description\n${extra}\n`,
    `name: >-\n  original\ndescription: A description\n${extra}\n`,
    `name: # Keep this comment\n  'original'\ndescription: A description\n${extra}\n`,
    `'name': !!str original\ndescription: A description\n${extra}\n`,
    `description: A description\n${extra}\nname: original\n\n`,
    `  name: original\n  description: A description\n  ${extra}\n`,
  ];
  for (const source of shapes) {
    const body = "\n# Instructions\r\nKeep this exact body.\r\n";
    const originalFiles = [
      { path: "SKILL.md", content: `---\n${source}---\n${body}` },
      ...files.slice(1),
    ];
    // Quoting the new name must also retain string type for a YAML 1.1 boolean spelling.
    const copy = drafts.copySystemSkillDraft("account-1", originalFiles, "on");
    const frontmatter = copy.files[0].content.match(
      /^---\r?\n([\s\S]*?)^---(?:\r?\n|$)/m
    )[1];
    const before = load(source, { schema: backendMetadataSchema });
    const after = load(frontmatter, { schema: backendMetadataSchema });
    assert.equal(before.metadata.enabled, false);
    assert.ok(before.metadata.allowed instanceof Set);
    assert.equal(after.name, "on");
    assert.deepEqual({ ...after, name: before.name }, before, source);
    assert.ok(
      frontmatter.includes(extra),
      "untouched unknown YAML stays byte-for-byte intact"
    );
    assert.equal(drafts.readSkillFrontmatter(copy.files[0].content).body, body);
    assert.deepEqual(copy.files.slice(1), originalFiles.slice(1));
    assert.deepEqual(
      copy.files.map((file) => file.path),
      originalFiles.map((file) => file.path)
    );
    assert.equal(originalFiles[0].content, `---\n${source}---\n${body}`);
  }
});

test("saved draft dirty detection includes all content, addition and removal; root cannot be removed", () => {
  const draft = drafts.createSkillDraft("account-1", saved);
  assert.equal(drafts.isSkillDraftDirty(draft), false);
  assert.notEqual(draft.files, saved.files);
  assert.notEqual(draft.files[0], draft.baselineFiles[0]);
  const changed = drafts.addSkillDraftFile(
    draft,
    { path: "refs/new.md", content: "Hello" },
    limits
  );
  assert.equal(drafts.isSkillDraftDirty(changed), true);
  assert.equal(changed.files.at(-1).path, "refs/new.md");
  assert.equal(
    drafts.isSkillDraftDirty(
      drafts.removeSkillDraftFile(changed, "refs/new.md")
    ),
    false
  );
  assert.throws(() => drafts.removeSkillDraftFile(draft, "SKILL.md"), /root/i);
  assert.throws(
    () =>
      drafts.addSkillDraftFile(
        draft,
        { path: "RESOURCES/HELP.txt", content: "" },
        limits
      ),
    /unique/i
  );
  assert.throws(
    () =>
      drafts.addSkillDraftFile(
        draft,
        { path: "../unsafe", content: "" },
        limits
      ),
    /relative/i
  );
  const blank = drafts.createSkillDraft("account-1", null);
  assert.equal(drafts.isSkillDraftDirty(blank), true);
  assert.ok(drafts.validateSkillDraft(blank, limits).length > 0);
});

test("local feedback applies server limits with UTF-8 bytes and portable paths", () => {
  const draft = drafts.createSkillDraft("a", saved);
  const invalid = {
    ...draft,
    files: [root, { path: "refs/big.txt", content: "éé" }],
  };
  assert.ok(
    drafts
      .validateSkillDraft(invalid, { ...limits, supporting_file_bytes: 3 })
      .some((d) => d.code === "skill_file_too_large")
  );
  for (const path of [
    "CON.txt",
    "refs./x",
    "refs/SKILL.md",
    "bad\\file",
    "x/../y",
  ]) {
    assert.ok(
      drafts.validateSkillDraft(
        { ...draft, files: [root, { path, content: "ok" }] },
        limits
      ).length > 0,
      path
    );
  }
});

test("system copy diagnostics expose binary, oversize, and missing files without partial copies", () => {
  const system = {
    id: "s1",
    name: "original",
    description: "description",
    origin: "system",
    availability: "available",
    revision: null,
    created_at: null,
    updated_at: null,
    diagnostics: [],
    resources: [
      { path: "SKILL.md", size_bytes: 100, copyable: true, diagnostics: [] },
      {
        path: "image.png",
        size_bytes: 100,
        copyable: false,
        diagnostics: [
          {
            code: "binary_resource",
            message: "Binary resources cannot be copied",
            path: "image.png",
          },
        ],
      },
    ],
  };
  assert.ok(
    drafts
      .assessSystemSkillCopy(system, [root], limits)
      .some((d) => d.path === "image.png")
  );
  assert.throws(
    () =>
      drafts.copySystemSkillDraft(
        "a",
        [root, { path: "binary", content: "\0" }],
        "copy"
      ),
    (e) => e.diagnostics.some((d) => d.code === "invalid_skill_text")
  );
  assert.throws(
    () =>
      drafts.copySystemSkillDraft(
        "a",
        [
          root,
          {
            path: "big",
            content: "x".repeat(limits.supporting_file_bytes + 1),
          },
        ],
        "copy"
      ),
    (e) => e.diagnostics.some((d) => d.code === "skill_file_too_large")
  );
  const html = renderToStaticMarkup(
    React.createElement(SkillDetails, {
      skill: system,
      files: [root],
      onCopy: () => {},
    })
  );
  assert.match(html, /Binary resources cannot be copied/);
  assert.match(html, /disabled=""/);
});

test("previews render hostile HTML and scripts as inert content and block unsafe markdown links", () => {
  for (const path of ["SKILL.md", "page.html"]) {
    const html = renderToStaticMarkup(
      React.createElement(SkillFilePreview, {
        file: {
          path,
          content:
            "<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[bad](javascript:alert(1))",
        },
        mode: "preview",
      })
    );
    assert.doesNotMatch(
      html,
      /<script|<img|href="javascript:|<[^>]+\sonerror=/
    );
  }
});

test("file navigation and editor expose file controls, diagnostics and explicit Save/Discard", () => {
  const navigator = renderToStaticMarkup(
    React.createElement(SkillFileList, {
      files,
      selectedPath: "SKILL.md",
      onSelect: () => {},
      onRemove: () => {},
    })
  );
  assert.match(navigator, /aria-current="true"/);
  assert.doesNotMatch(navigator, /Remove SKILL.md/);
  assert.match(navigator, /Remove resources\/help.txt/);
  const editor = renderToStaticMarkup(
    React.createElement(SkillEditor, {
      draft: drafts.createSkillDraft("a", saved),
      limits,
      diagnostics: [
        { code: "conflict", message: "Reload this skill", path: "SKILL.md" },
      ],
      saving: false,
      onChange: () => {},
      onSave: () => {},
      onDiscard: () => {},
    })
  );
  assert.match(editor, /Reload this skill/);
  assert.match(editor, />Save/);
  assert.match(editor, />Discard/);
  assert.match(editor, /Add file/);
  assert.match(editor, /SKILL.md/);
});

test("metadata validation rejects ambiguous and unsafe YAML without altering resources", () => {
  for (const content of [
    "---\nname: a\nname: b\ndescription: text\n---\nBody",
    "---\nname: a\ndescription: text\nx: &x [1]\ny: *x\n---\nBody",
    "---\nname: a\ndescription: text\nx: !!js/function 'function(){}'\n---\nBody",
  ]) {
    const draft = {
      ...drafts.createSkillDraft("a", saved),
      files: [{ path: "SKILL.md", content }, files[1]],
    };
    assert.ok(
      drafts
        .validateSkillDraft(draft, limits)
        .some((d) => d.code === "invalid_skill_metadata")
    );
    assert.throws(
      () => drafts.copySystemSkillDraft("a", draft.files, "other"),
      api.SkillsApiError
    );
    assert.deepEqual(draft.files[1], files[1]);
  }
  assert.throws(
    () =>
      drafts.addSkillDraftFile(
        drafts.createSkillDraft("a", saved),
        { path: "resources", content: "" },
        limits
      ),
    /directory/
  );
});

test(
  "skill package components support editing, filters, copy blockers and safe import replacement on narrow layouts",
  { skip: process.env.PERSONAL_SKILLS_COMPONENT_BROWSER_TEST !== "1" },
  async () => {
    const { createServer } = await import("node:http");
    const { readFile, readdir } = await import("node:fs/promises");
    const { join, resolve } = await import("node:path");
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.PERSONAL_SKILLS_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const rootDir = resolve(import.meta.dirname, "..");
    const fixture = await build({
      absWorkingDir: rootDir,
      stdin: {
        contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {SkillCatalog} from "./src/app/components/skills/SkillCatalog";
    import {SkillDetails} from "./src/app/components/skills/SkillDetails";
    import {SkillEditor} from "./src/app/components/skills/SkillEditor";
    import {SkillImportDialog} from "./src/app/components/skills/SkillImportDialog";
    import {createSkillDraft} from "./src/lib/skill-drafts";
    const saved=${JSON.stringify(saved)}, limits=${JSON.stringify(limits)};
    const personal={...saved,origin:"personal",availability:"available"};
    const system={...personal,id:"s1",origin:"system",name:"system-skill",resources:[{path:"SKILL.md",size_bytes:100,copyable:true,diagnostics:[]},{path:"image.png",size_bytes:100,copyable:false,diagnostics:[{code:"binary",message:"Binary resources cannot be copied",path:"image.png"}]}],diagnostics:[]};
    function Fixture(){
      const [draft,setDraft]=React.useState(createSkillDraft("a",saved));
      const [open,setOpen]=React.useState(false);
      const [preview,setPreview]=React.useState({package:{...saved,total_bytes:123},diagnostics:[]});
      const [diagnostics,setDiagnostics]=React.useState([]);
      window.fixture={setPreview};
      return <main className="mx-auto min-w-0 max-w-4xl space-y-6 p-4">
        <SkillCatalog entries={[personal,system]} onSelect={entry=>window.selected=entry} onCreate={()=>{}} onImport={()=>setOpen(true)}/>
        <SkillEditor draft={draft} limits={limits} diagnostics={diagnostics} saving={false} onChange={setDraft} onSave={()=>{window.saved=draft;setDiagnostics([{code:"conflict",message:"Changed elsewhere; your draft is preserved",path:"SKILL.md"}])}} onDiscard={()=>setDraft(createSkillDraft("a",saved))}/>
        <SkillDetails skill={system} files={saved.files} limits={limits} onCopy={()=>window.copied=true}/>
        <SkillImportDialog open={open} preview={preview} limits={limits} diagnostics={[]} loading={false} onOpenChange={setOpen} onFile={()=>{window.fileChosen=true}} onImport={()=>window.imported=true}/>
      </main>;
    }
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `,
        loader: "tsx",
        resolveDir: rootDir,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    let css = "";
    for (const name of await readdir(join(rootDir, "out/_next/static/chunks")))
      if (name.endsWith(".css"))
        css += await readFile(
          join(rootDir, "out/_next/static/chunks", name),
          "utf8"
        );
    const server = createServer((request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("content-type", "text/javascript");
        response.end(fixture.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("content-type", "text/css");
        response.end(css);
      } else {
        response.setHeader("content-type", "text/html");
        response.end(
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PERSONAL_SKILLS_BROWSER_EXECUTABLE,
    });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const editor = page.getByRole("region", { name: "Skill editor" });
      await editor.getByLabel("New resource path").fill("references/new.md");
      await editor
        .getByRole("button", { name: "Add file", exact: true })
        .click();
      await editor
        .getByRole("textbox", { name: "references/new.md", exact: true })
        .fill(
          "# Safe preview\n<script>window.pwned=true</script>\n[bad](javascript:alert(1))"
        );
      await editor
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      assert.equal(await page.evaluate(() => window.pwned), undefined);
      assert.equal(await editor.locator('a[href^="javascript:"]').count(), 0);
      await editor.getByRole("button", { name: "Save", exact: true }).click();
      await editor
        .getByText("Changed elsewhere; your draft is preserved", {
          exact: false,
        })
        .waitFor();
      await editor.getByRole("button", { name: "Source", exact: true }).click();
      assert.match(
        await editor
          .getByRole("textbox", { name: "references/new.md", exact: true })
          .inputValue(),
        /Safe preview/
      );
      await editor
        .getByRole("button", { name: "Remove references/new.md", exact: true })
        .click();
      assert.equal(
        await editor
          .getByRole("button", { name: "references/new.md", exact: true })
          .count(),
        0
      );
      await editor
        .getByRole("button", { name: "Discard", exact: true })
        .click();
      assert.equal(
        await editor
          .getByRole("button", { name: "Save", exact: true })
          .isDisabled(),
        true
      );
      const catalog = page.getByRole("region", { name: "Skill catalog" });
      await catalog.getByLabel("Filter skill origin").selectOption("system");
      assert.equal(
        await catalog
          .getByRole("button", { name: /original Personal/ })
          .count(),
        0
      );
      await catalog
        .getByRole("button", { name: /system-skill System/ })
        .click();
      assert.equal(await page.evaluate(() => window.selected.origin), "system");
      const details = page.getByRole("region", { name: "Skill details" });
      await details
        .getByLabel("Copy to personal library", { exact: true })
        .fill("my-copy");
      assert.equal(
        await details
          .getByRole("button", { name: "Copy as draft", exact: true })
          .isDisabled(),
        true
      );
      for (const width of [320, 375, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const dark of [false, true]) {
          await page.evaluate(
            (dark) => document.documentElement.classList.toggle("dark", dark),
            dark
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth
            ),
            false,
            `overflow at ${width}, dark=${dark}`
          );
        }
      }
      await catalog
        .getByRole("button", { name: "Import", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Open draft", exact: true })
        .waitFor();
      await dialog
        .getByLabel("Skill file or ZIP", { exact: true })
        .setInputFiles({
          name: "replacement.md",
          mimeType: "text/markdown",
          buffer: Buffer.from("replacement"),
        });
      assert.equal(
        await dialog
          .getByRole("button", { name: "Open draft", exact: true })
          .isDisabled(),
        true,
        "old preview is invalidated even before the parent responds"
      );
      await page.evaluate(() =>
        window.fixture.setPreview({
          package: {
            name: "replacement",
            description: "New package",
            files: [{ path: "SKILL.md", content: "# new" }],
            total_bytes: 5,
          },
          diagnostics: [],
        })
      );
      await dialog
        .getByRole("button", { name: "Open draft", exact: true })
        .click();
      assert.equal(await page.evaluate(() => window.imported), true);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
