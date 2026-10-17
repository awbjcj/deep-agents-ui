import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { DEFAULT_SKILL_LIMITS } from "../src/lib/skill-drafts.ts";

const RUN = process.env.PERSONAL_SKILLS_BROWSER_TEST === "1";
const EVIDENCE = resolve("docs/evidence/personal-skills");
const source = (name, text = "Follow these instructions.") =>
  `---\nname: ${name}\ndescription: Private instructions\n---\n${text}\n`;
const personal = (id, name, text) => ({
  id,
  name,
  description: "Private instructions",
  revision: 1,
  created_at: "2026-10-17T12:00:00Z",
  updated_at: "2026-10-17T12:00:00Z",
  files: [{ path: "SKILL.md", content: source(name, text) }],
});
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function captureMatrix(page, state, target) {
  for (const width of [1440, 320, 375, 390]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme
      );
      if (state === "tabs") {
        await page.locator('[role="tab"]:focus').press("Home");
        await page
          .getByRole("tab", { name: "Models", exact: true })
          .press("End");
        const focusedBounds = await page
          .getByRole("tab", { name: "Connections", exact: true })
          .boundingBox();
        assert(
          focusedBounds.x >= -1 &&
            focusedBounds.x + focusedBounds.width <= width + 1
        );
      }
      const bounds = await target.boundingBox();
      assert(
        bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1,
        `${state}: horizontal bounds ${JSON.stringify(bounds)}`
      );
      assert.equal(
        await target.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        `${state}: contents fit`
      );
      await target.screenshot({
        path: join(EVIDENCE, `${width}-${state}-${theme}.png`),
        animations: "disabled",
      });
      if (state === "tabs" && width === 320 && theme === "light")
        await page.screenshot({
          path: join(EVIDENCE, "mobile-workspace-context-light.png"),
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  if (state === "conflict")
    await page.screenshot({
      path: join(EVIDENCE, "desktop-workspace-context-light.png"),
      animations: "disabled",
    });
}
function skillsFixture() {
  const base = makePolicyFixture();
  const packages = new Map([
    ["p1", personal("p1", "my-skill", "PRIVATE-RESOURCE-A")],
  ]);
  const requests = [],
    chatRequests = [],
    readPaths = [];
  let conflict = false,
    delayed = null,
    failImport = false,
    serverFailure = false,
    catalogFailure = false;
  const system = {
    id: "s1",
    name: "system-skill",
    description: "System instructions",
    origin: "system",
    availability: "available",
    revision: null,
    created_at: null,
    updated_at: null,
    resources: [
      { path: "SKILL.md", size_bytes: 100, copyable: true, diagnostics: [] },
      {
        path: "references/help.txt",
        size_bytes: 18,
        copyable: true,
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
  return {
    ...base,
    packages,
    requests,
    chatRequests,
    readPaths,
    conflict() {
      conflict = true;
    },
    failImport() {
      failImport = true;
    },
    failSave() {
      serverFailure = true;
    },
    failCatalog() {
      catalogFailure = true;
    },
    delayRead() {
      delayed = deferred();
      return delayed;
    },
    async route(route, account) {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      if (path.endsWith("/threads/evidence-thread/history"))
        return json(route, [
          {
            values: {
              messages: [
                {
                  type: "ai",
                  id: "evidence-call",
                  content: "",
                  tool_calls: [
                    {
                      id: "search-call",
                      name: "search_database",
                      args: { query: "notes" },
                    },
                  ],
                },
                {
                  type: "tool",
                  id: "evidence-result",
                  tool_call_id: "search-call",
                  content:
                    "[1] (score: 0.8)\n    evidence: Selected evidence excerpt\n    metadata: title: Design notes | url: https://example.test/source",
                },
              ],
              files: {},
              todos: [],
            },
            tasks: [],
            next: [],
            checkpoint: {
              thread_id: "evidence-thread",
              checkpoint_id: "head",
              checkpoint_ns: "",
            },
            parent_checkpoint: null,
            metadata: {},
            created_at: "2026-10-17T12:00:00Z",
          },
        ]);
      if (path.endsWith("/history") || path.endsWith("/threads/search"))
        return json(route, []);
      if (path.endsWith("/threads"))
        return json(route, { thread_id: "sent-thread" });
      if (path.includes("/runs")) {
        chatRequests.push({ path, body: request.postData() });
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: "event: end\ndata: null\n\n",
        });
      }
      if (!path.startsWith("/api/skills")) return base.route(route, account);
      requests.push({
        account: account.user_id,
        method: request.method(),
        path,
        body: request.postData(),
      });
      if (path === "/api/skills" && catalogFailure) {
        catalogFailure = false;
        return json(route, { detail: "Catalog unavailable" }, 503);
      }
      if (path === "/api/skills")
        return json(route, {
          entries: [
            system,
            ...[...packages.values()].map((p) => ({
              ...p,
              files: undefined,
              origin: "personal",
              availability: "available",
            })),
          ],
          limits: DEFAULT_SKILL_LIMITS,
          library_revision: 1,
          system_revision: "s1",
        });
      if (path === "/api/skills/import/preview") {
        if (failImport) {
          failImport = false;
          return json(
            route,
            {
              detail: {
                code: "bad_zip",
                message: "Invalid ZIP package",
                diagnostics: [
                  {
                    code: "bad_zip",
                    message: "Choose a valid text package.",
                    path: null,
                  },
                ],
              },
            },
            422
          );
        }
        return json(route, {
          package: {
            name: "imported-skill",
            description: "Imported package",
            files: [{ path: "SKILL.md", content: source("imported-skill") }],
            total_bytes: 90,
          },
          diagnostics: [],
        });
      }
      if (path === "/api/skills/system/s1") return json(route, system);
      if (path === "/api/skills/system/s1/file") {
        const filePath = url.searchParams.get("path");
        readPaths.push(filePath);
        return json(route, {
          path: filePath,
          content:
            filePath === "SKILL.md"
              ? source("system-skill")
              : "Complete resource.",
        });
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON(),
          name = /name: (.*)/.exec(body.files[0].content)[1];
        const saved = {
          ...personal(`p${packages.size + 1}`, name),
          files: body.files,
        };
        packages.set(saved.id, saved);
        return json(route, saved, 201);
      }
      const id = path.split("/").at(-1),
        snapshot = { ...packages.get(id) };
      if (request.method() === "GET") {
        if (delayed) {
          const wait = delayed;
          delayed = null;
          await wait.promise;
        }
        return json(route, snapshot);
      }
      if (request.method() === "DELETE") {
        packages.delete(id);
        return route.fulfill({ status: 204 });
      }
      if (serverFailure) {
        serverFailure = false;
        return json(
          route,
          { detail: { code: "storage_error", message: "Storage unavailable" } },
          503
        );
      }
      if (conflict) {
        conflict = false;
        packages.set(id, {
          ...snapshot,
          revision: snapshot.revision + 1,
          files: [
            {
              path: "SKILL.md",
              content: source(snapshot.name, "LATEST SERVER VERSION"),
            },
          ],
        });
        return json(
          route,
          {
            detail: {
              code: "skill_revision_conflict",
              message: "Skill changed on the server.",
            },
          },
          409
        );
      }
      const body = request.postDataJSON(),
        saved = {
          ...snapshot,
          name: /name: (.*)/.exec(body.files[0].content)[1],
          files: body.files,
          revision: snapshot.revision + 1,
        };
      packages.set(id, saved);
      return json(route, saved);
    },
  };
}
async function openSkills(page) {
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page
    .getByRole("tab", { name: "Skills", exact: true })
    .click({ timeout: 5000 });
  await page.getByRole("heading", { name: "Your skills" }).waitFor();
}
const editor = (page) => page.getByRole("region", { name: "Skill editor" });
const content = (page) =>
  editor(page).getByRole("textbox", { name: "SKILL.md", exact: true });
async function selectPersonal(page) {
  await page.getByRole("button", { name: /my-skill Personal/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
}
async function switchAccount(page, policy) {
  await page.evaluate(() =>
    localStorage.setItem("vsda_token_setup_dismissed_account-b", "1")
  );
  policy.switchAccountOnProfileUpdate("account-b");
  await page.getByRole("button", { name: "Account settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Account", exact: true });
  await dialog.getByLabel("New username").fill("account-b");
  await dialog.getByRole("button", { name: "Save username" }).click();
  await dialog.getByText("Signed in as account-b.").waitFor();
  await dialog.locator('[data-slot="dialog-close"]').click();
  await dialog.waitFor({ state: "hidden" });
}

test("personal skills built UI", { skip: !RUN }, async (t) => {
  const { chromium } = await import(
    process.env.PERSONAL_SKILLS_PLAYWRIGHT_MODULE ?? "playwright"
  );
  const server = await staticServer();
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PERSONAL_SKILLS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PERSONAL_SKILLS_BROWSER_EXECUTABLE }
      : {}),
  });
  await mkdir(EVIDENCE, { recursive: true });
  try {
    await t.test(
      "create import copy edit rename delete and preview validation",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          await page
            .getByRole("button", { name: "New skill", exact: true })
            .click();
          assert.equal(
            await editor(page)
              .getByRole("button", { name: "Save", exact: true })
              .isDisabled(),
            true
          );
          await content(page).fill(source("created-skill"));
          await editor(page)
            .getByRole("button", { name: "Preview", exact: true })
            .click();
          await editor(page)
            .getByText("Follow these instructions.", { exact: true })
            .waitFor();
          await editor(page)
            .getByRole("button", { name: "Source", exact: true })
            .click();
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page.getByText("Skill saved.", { exact: true }).waitFor();
          await page
            .getByRole("button", { name: /system-skill System/ })
            .click();
          await page.getByLabel("Copy to personal library").fill("system-copy");
          await page.getByRole("button", { name: "Copy as draft" }).click();
          await content(page).waitFor();
          assert(policy.readPaths.includes("references/help.txt"));
          assert.equal(
            policy.requests.filter(
              (r) => r.method === "POST" && r.path === "/api/skills/personal"
            ).length,
            1
          );
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page.getByText("Skill saved.", { exact: true }).waitFor();
          await selectPersonal(page);
          await content(page).fill(source("renamed-skill", "Updated body"));
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page
            .getByRole("heading", { name: "renamed-skill", exact: true })
            .waitFor();
          page.once("dialog", (d) => {
            assert.match(d.message(), /renamed-skill/);
            void d.accept();
          });
          await page
            .getByRole("button", { name: "Delete", exact: true })
            .click();
          await page.getByText("Skill deleted.", { exact: true }).waitFor();
          await page
            .getByRole("button", { name: "Import", exact: true })
            .click();
          policy.failImport();
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "bad.zip",
            mimeType: "application/zip",
            buffer: Buffer.from("bad"),
          });
          await page
            .getByText("Invalid ZIP package", { exact: true })
            .waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: "Open draft", exact: true })
              .isDisabled(),
            true
          );
          await captureMatrix(
            page,
            "import-error",
            page.getByRole("dialog", { name: "Import skill package" })
          );
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "SKILL.md",
            mimeType: "text/markdown",
            buffer: Buffer.from(source("imported-skill")),
          });
          await page
            .getByRole("button", { name: "Open draft", exact: true })
            .click();
          assert.match(await content(page).inputValue(), /imported-skill/);
          assert.equal(
            policy.requests.filter(
              (r) => r.method === "POST" && r.path === "/api/skills/personal"
            ).length,
            2
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "conflicts and cancelled navigation retain drafts; confirmed discard leaves",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          await selectPersonal(page);
          const unsavedDraft = source("my-skill", "UNSAVED PRIVATE DRAFT");
          await content(page).fill(unsavedDraft);
          policy.conflict();
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page
            .getByText("Skill changed on the server.", { exact: true })
            .waitFor();
          const editorAfterConflict = await content(page).inputValue();
          assert.equal(editorAfterConflict, unsavedDraft);
          await page
            .getByRole("button", { name: "View latest version" })
            .focus();
          await captureMatrix(page, "conflict", page.locator("#right-panel"));
          await page
            .getByRole("button", { name: "View latest version" })
            .click();
          await page
            .getByLabel("Latest saved skill")
            .getByText(/LATEST SERVER VERSION/)
            .waitFor();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.dismiss());
          await page.getByRole("tab", { name: "Tools", exact: true }).click();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.dismiss());
          await page
            .getByRole("button", { name: "Close workspace panel" })
            .click();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.dismiss());
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.dismiss());
          await page
            .getByRole("button", { name: /system-skill System/ })
            .click();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          for (const width of [1440, 320, 375, 390])
            for (const theme of ["light", "dark"]) {
              await page.setViewportSize({ width, height: 1000 });
              await page.evaluate((theme) => {
                document.documentElement.classList.toggle(
                  "dark",
                  theme === "dark"
                );
              }, theme);
              await content(page).focus();
              assert.equal(
                await content(page).evaluate(
                  (el) => el === document.activeElement
                ),
                true
              );
              const panel = page.locator("#right-panel");
              const bounds = await panel.boundingBox();
              assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
              assert.equal(
                await panel.evaluate(
                  (el) => el.scrollWidth <= el.clientWidth + 1
                ),
                true
              );
              await panel.screenshot({
                path: join(EVIDENCE, `${width}-editor-conflict-${theme}.png`),
              });
            }
          await page.setViewportSize({ width: 1440, height: 1000 });
          page.once("dialog", (d) => d.accept());
          await page.getByRole("tab", { name: "Tools", exact: true }).click();
          await page.getByRole("heading", { name: "My agent tools" }).waitFor();
          await page.getByRole("tab", { name: "Skills", exact: true }).click();
          assert.equal(await editor(page).count(), 0);
          const storage = await page.evaluate(() =>
            JSON.stringify({ ...localStorage, ...sessionStorage })
          );
          assert.equal(storage.includes("UNSAVED PRIVATE DRAFT"), false);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test("account switch rejects late skill responses", async () => {
      const policy = skillsFixture();
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        server,
        policy,
        "admin"
      );
      try {
        await openSkills(page);
        const delayed = policy.delayRead();
        await page.getByRole("button", { name: /my-skill Personal/ }).click();
        await switchAccount(page, policy);
        delayed.release();
        await page.getByRole("heading", { name: "Your skills" }).waitFor();
        await page
          .getByRole("button", { name: "New skill", exact: true })
          .click();
        const accountBText = await content(page).inputValue();
        assert.equal(accountBText.includes("PRIVATE-RESOURCE-A"), false);
        await content(page).fill(source("account-b-draft"));
        const values = await page
          .locator("textarea")
          .evaluateAll((nodes) => nodes.map((n) => n.value).join("\n"));
        assert.equal(values.includes("PRIVATE-RESOURCE-A"), false);
        page.once("dialog", (d) => d.accept());
        await page
          .getByRole("button", { name: "Close workspace panel" })
          .click();
        await page
          .getByRole("button", { name: "Workspace", exact: true })
          .click();
        assert.equal(await editor(page).count(), 0);
        assert.deepEqual(pageErrors, []);
      } finally {
        await context.close();
      }
    });
    await t.test(
      "server errors preserve drafts and discard only happens after confirmation",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          await selectPersonal(page);
          const unsavedDraft = source("my-skill", "KEEP AFTER FAILURE");
          await content(page).fill(unsavedDraft);
          policy.failSave();
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page
            .getByText("Storage unavailable", { exact: true })
            .waitFor();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          policy.failCatalog();
          await page.getByRole("button", { name: "Refresh catalog" }).click();
          await page
            .getByText("Catalog unavailable", { exact: true })
            .waitFor();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          await page.getByRole("button", { name: "Retry catalog" }).click();
          await page
            .getByText("Catalog unavailable", { exact: true })
            .waitFor({ state: "hidden", timeout: 1500 });
          await page.getByRole("heading", { name: "Your skills" }).waitFor();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.dismiss());
          await editor(page)
            .getByRole("button", { name: "Discard", exact: true })
            .click();
          assert.equal(await content(page).inputValue(), unsavedDraft);
          page.once("dialog", (d) => d.accept());
          await editor(page)
            .getByRole("button", { name: "Discard", exact: true })
            .click();
          assert.equal(await editor(page).count(), 0);
          await page
            .getByRole("button", { name: "Close workspace panel" })
            .click();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "logout clears account drafts and ignores a late response",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          // The shared fixture seeds every new document. Prevent its test-only
          // initializer from signing back in when logout navigates to login.
          await page.addInitScript(() => {
            if (!sessionStorage.getItem("skills-fixture-logout")) return;
            localStorage.removeItem("deep-agent-auth");
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
              if (this === localStorage && key === "deep-agent-auth") return;
              setItem.call(this, key, value);
            };
          });
          await openSkills(page);
          const delayed = policy.delayRead();
          await page.getByRole("button", { name: /my-skill Personal/ }).click();
          await page.getByRole("button", { name: /admin-fixture/ }).click();
          await page.evaluate(() =>
            sessionStorage.setItem("skills-fixture-logout", "1")
          );
          await page.getByRole("menuitem", { name: "Sign out" }).click();
          delayed.release();
          await page.waitForURL(/\/login/);
          await page
            .getByRole("textbox", { name: "Message", exact: true })
            .waitFor({ state: "hidden" });
          assert.equal(
            (await page.locator("body").innerText()).includes(
              "PRIVATE-RESOURCE-A"
            ),
            false
          );
          assert.equal(await page.locator("textarea").count(), 0);
          assert.equal(
            await page.evaluate(() =>
              JSON.stringify({ ...localStorage, ...sessionStorage }).includes(
                "PRIVATE-RESOURCE-A"
              )
            ),
            false
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "existing evidence insertion still appends to its thread draft",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          { ...server, baseUrl: `${server.baseUrl}?threadId=evidence-thread` },
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("Existing question");
          await page
            .getByRole("button", { name: "search_database", exact: true })
            .click();
          await page.getByRole("checkbox", { name: "Design notes" }).check();
          await page
            .getByRole("button", { name: /Add selected to message/ })
            .click();
          await page.waitForFunction(() =>
            document
              .querySelector('textarea[aria-label="Message"]')
              ?.value.includes("Selected evidence excerpt")
          );
          assert.match(
            await message.inputValue(),
            /^Existing question\n\nUse the following selected search evidence/
          );
          assert.equal(policy.chatRequests.length, 0);
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          await page
            .getByRole("button", { name: "Append skill request" })
            .click();
          const text = await message.inputValue();
          assert.match(text, /Selected evidence excerpt/);
          assert.match(text, /personal skill/);
          assert.equal(text.split("Selected evidence excerpt").length, 2);
          assert.equal(policy.chatRequests.length, 0);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "skill prefill preserves unsent text and requires Append without autosend",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const existingMessage = "Existing unsent message";
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill(existingMessage);
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          await page
            .getByRole("button", { name: "Append skill request" })
            .waitFor();
          const composerBeforeAppend = await message.inputValue();
          assert.equal(composerBeforeAppend, existingMessage);
          const chatRequestsBeforeSend = [...policy.chatRequests];
          assert.equal(chatRequestsBeforeSend.length, 0);
          await page
            .getByRole("button", { name: "Append skill request" })
            .click();
          assert.match(
            await message.inputValue(),
            /^Existing unsent message\n\n/
          );
          assert.match(await message.inputValue(), /personal skill/);
          assert.equal(
            await message.evaluate((el) => el === document.activeElement),
            true
          );
          assert.equal(policy.chatRequests.length, 0);
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          await page
            .getByRole("button", { name: "Cancel skill request" })
            .click();
          const appended = await message.inputValue();
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          // Pending request belongs to the new conversation; moving to another thread cancels it.
          await page.evaluate(() => {
            const url = new URL(location.href);
            url.searchParams.set("threadId", "other-thread");
            history.pushState({}, "", url);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
          await page
            .getByRole("button", { name: "Append skill request" })
            .waitFor({ state: "hidden" });
          assert.equal(
            (await message.inputValue()).includes("personal skill"),
            false
          );
          await page.evaluate(() => {
            const url = new URL(location.href);
            url.searchParams.delete("threadId");
            history.pushState({}, "", url);
            window.dispatchEvent(new PopStateEvent("popstate"));
          });
          await page.waitForFunction(
            (expected) =>
              document.querySelector('textarea[aria-label="Message"]')
                ?.value === expected,
            appended
          );
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          await switchAccount(page, policy);
          assert.equal(
            await page
              .getByRole("button", { name: "Append skill request" })
              .count(),
            0
          );
          assert.equal(
            (await message.inputValue()).includes("personal skill"),
            false
          );
          assert.equal(policy.chatRequests.length, 0);
          // An empty composer accepts a matching request once and waits for Send.
          await openSkills(page);
          await page
            .getByRole("button", { name: "Create with vsda-deep-agent" })
            .click();
          await page.waitForFunction(() =>
            document
              .querySelector('textarea[aria-label="Message"]')
              ?.value.includes("personal skill")
          );
          assert.equal(
            (await message.inputValue()).split("Help me create").length,
            2
          );
          assert.equal(
            await message.evaluate((el) => el === document.activeElement),
            true
          );
          assert.equal(policy.chatRequests.length, 0);
          const sent = page.waitForResponse(
            (response) => new URL(response.url()).pathname.includes("/runs"),
            { timeout: 5000 }
          );
          await page.getByRole("button", { name: "Send message" }).click();
          await sent;
          assert(policy.chatRequests.length > 0);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "five tabs scroll with manual keyboard activation at 320px",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await page.setViewportSize({ width: 320, height: 800 });
          const workspaceButton = page.getByRole("button", {
            name: "Workspace",
            exact: true,
          });
          const buttonBounds = await workspaceButton.boundingBox();
          assert(
            buttonBounds.x >= -1 && buttonBounds.x + buttonBounds.width <= 321
          );
          assert.equal(
            await page
              .locator("header")
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            true
          );
          await openSkills(page);
          const rail = page.getByRole("tablist", {
            name: "Workspace sections",
          });
          assert.deepEqual(await rail.getByRole("tab").allTextContents(), [
            "Models",
            "Tools",
            "Skills",
            "Tokens",
            "Connections",
          ]);
          const skillsTab = rail.getByRole("tab", {
            name: "Skills",
            exact: true,
          });
          await skillsTab.focus();
          await skillsTab.press("End");
          const connections = rail.getByRole("tab", {
            name: "Connections",
            exact: true,
          });
          assert.equal(
            await connections.evaluate((el) => el === document.activeElement),
            true
          );
          assert.equal(await skillsTab.getAttribute("aria-selected"), "true");
          const bounds = await connections.boundingBox();
          assert(
            bounds.x >= -1 && bounds.x + bounds.width <= 321,
            JSON.stringify(bounds)
          );
          await page.screenshot({ path: join(EVIDENCE, "320-tabs-light.png") });
          await captureMatrix(page, "tabs", page.locator("#right-panel"));
          await connections.press("Home");
          await rail
            .getByRole("tab", { name: "Models", exact: true })
            .press("ArrowRight");
          await rail
            .getByRole("tab", { name: "Tools", exact: true })
            .press("Enter");
          await page.getByRole("heading", { name: "My agent tools" }).waitFor();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
  } finally {
    await browser.close();
    await server.close();
  }
});
