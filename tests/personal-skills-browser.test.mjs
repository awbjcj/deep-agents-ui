import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { load } from "js-yaml";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { DEFAULT_SKILL_LIMITS } from "../src/lib/skill-drafts.ts";

const RUN = process.env.PERSONAL_SKILLS_BROWSER_TEST === "1";
const EVIDENCE = resolve(
  process.env.PERSONAL_SKILLS_EVIDENCE_DIR ?? "docs/evidence/personal-skills"
);
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
    catalogFailure = false,
    malformedCatalog = false;
  let importedFiles = [{ path: "SKILL.md", content: source("imported-skill") }];
  let delayedImport = null;
  const packageName = (files) =>
    load(files.find((f) => f.path === "SKILL.md").content.split("---")[1]).name;
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
    setImportFiles(files) {
      importedFiles = files;
    },
    delayImport() {
      delayedImport = deferred();
      return delayedImport;
    },
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
    corruptCatalog(value = true) {
      malformedCatalog = value;
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
        // Recovery lists active runs without submitting a message.
        if (request.method() === "GET") return json(route, []);
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
      if (path === "/api/skills" && malformedCatalog)
        return json(route, { entries: null });
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
              availability:
                p.name === system.name ? "name_conflict" : "available",
            })),
          ],
          limits: DEFAULT_SKILL_LIMITS,
          library_revision: 1,
          system_revision: "s1",
        });
      if (path === "/api/skills/import/preview") {
        if (delayedImport) {
          const wait = delayedImport;
          delayedImport = null;
          await wait.promise;
        }
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
            name: packageName(importedFiles),
            description: "Imported package",
            files: importedFiles,
            total_bytes: 90,
          },
          diagnostics:
            [...packages.values()].some(
              (p) => p.name === packageName(importedFiles)
            ) || packageName(importedFiles) === system.name
              ? [
                  {
                    code: "skill_name_conflict",
                    message:
                      "This name is already reserved. Rename the draft before saving.",
                    path: "SKILL.md",
                  },
                ]
              : [],
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
      if (["POST", "PUT"].includes(request.method())) {
        const body = request.postDataJSON(),
          name = packageName(body.files),
          id = path.split("/").at(-1);
        if (
          name === system.name ||
          [...packages.values()].some(
            (p) =>
              p.name === name && (request.method() === "POST" || p.id !== id)
          )
        )
          return json(
            route,
            {
              detail: {
                code: "skill_name_conflict",
                message: "A skill already uses this name.",
              },
            },
            409
          );
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON(),
          name = packageName(body.files);
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
          name: packageName(body.files),
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
async function browseSkills(page) {
  const back = page.getByRole("button", {
    name: "Back to skills",
    exact: true,
  });
  if (await back.isVisible()) await back.click();
}
async function selectCatalogSkill(page, name) {
  await browseSkills(page);
  await page.getByRole("button", { name }).click();
}
async function selectPersonal(page) {
  await selectCatalogSkill(page, /my-skill Personal/);
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
      "malformed catalog responses show a recoverable error without crashing",
      async () => {
        const policy = skillsFixture();
        policy.corruptCatalog();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          const panel = page.locator("#right-panel");
          await panel
            .getByRole("alert")
            .filter({ hasText: "invalid skill response" })
            .waitFor();
          assert.equal(
            await panel.getByText("No skills yet.", { exact: false }).count(),
            0
          );
          policy.corruptCatalog(false);
          await panel.getByRole("button", { name: "Retry catalog" }).click();
          await panel
            .getByRole("button", { name: /my-skill Personal/ })
            .waitFor();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "focused workspace retains search, restores focus, and fits a narrow desktop panel",
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
            .getByLabel("Search skills", { exact: true })
            .fill("my-skill");
          await page
            .getByRole("button", { name: /my-skill Personal/ })
            .press("Enter");
          await page
            .getByRole("button", { name: "Edit", exact: true })
            .waitFor();
          assert.equal(
            await page
              .getByRole("region", { name: "Skill catalog" })
              .isVisible(),
            false
          );
          assert.equal(
            await page
              .getByLabel("Selected skill package", { exact: true })
              .evaluate((el) => el === document.activeElement),
            true
          );
          await browseSkills(page);
          assert.equal(
            await page
              .getByLabel("Search skills", { exact: true })
              .inputValue(),
            "my-skill"
          );
          assert.equal(
            await page
              .getByRole("button", { name: /my-skill Personal/ })
              .evaluate((el) => el === document.activeElement),
            true
          );
          await page
            .getByLabel("Search skills", { exact: true })
            .fill("no-such-skill");
          await page.getByRole("button", { name: "Clear filters" }).click();
          await selectPersonal(page);
          await content(page).fill(
            source("my-skill", "# Instructions\nA focused editing workspace.")
          );
          const expandedBounds = await page
            .locator("#right-panel")
            .boundingBox();
          assert.equal(expandedBounds.x, 0);
          assert.equal(expandedBounds.width, 1440);
          assert.equal(await page.locator("#chat").getAttribute("inert"), "");
          await page
            .getByRole("button", { name: "Restore workspace panel" })
            .click();
          assert.match(
            await content(page).inputValue(),
            /A focused editing workspace/
          );
          for (const [width, height] of [
            [1440, 1000],
            [375, 812],
            [812, 375],
          ]) {
            await page.setViewportSize({ width, height });
            await page.emulateMedia({ reducedMotion: "reduce" });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (theme) =>
                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  ),
                theme
              );
              const panel = page.locator("#right-panel");
              assert.equal(
                await panel.evaluate(
                  (el) => el.scrollWidth <= el.clientWidth + 1
                ),
                true
              );
              const textarea = await content(page).boundingBox();
              const editorBounds = await editor(page).boundingBox();
              if (editorBounds.width < 576) {
                assert(
                  textarea.width >= editorBounds.width - 4,
                  "narrow workspace gives the editor full width even on desktop"
                );
              } else {
                assert(
                  textarea.width >= 380,
                  "wide workspace keeps a readable editor beside the file list"
                );
              }
              await content(page).focus();
              const save = editor(page).getByRole("button", {
                name: "Save",
                exact: true,
              });
              await save.focus();
              const saveBounds = await save.boundingBox();
              assert(
                saveBounds.y >= 0 &&
                  saveBounds.y + saveBounds.height <= height + 1,
                "focused Save stays visible"
              );
              await panel.screenshot({
                path: join(EVIDENCE, `${width}-focused-editor-${theme}.png`),
                animations: "disabled",
              });
            }
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.evaluate(() =>
            document.documentElement.classList.remove("dark")
          );
          page.once("dialog", (d) => d.accept());
          await browseSkills(page);
          await captureMatrix(page, "library", page.locator("#right-panel"));
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "skill source and previews fill the remaining height and scroll long files internally",
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
          const panel = page.locator("#right-panel");
          const heights = [];
          for (const [width, height] of [
            [1440, 1000],
            [1440, 1440],
            [2560, 1440],
          ]) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (theme) =>
                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  ),
                theme
              );
              await editor(page)
                .getByRole("button", { name: "Source", exact: true })
                .click();
              const sourceBounds = await content(page).boundingBox();
              if (theme === "light" && width === 1440)
                heights.push(sourceBounds.height);
              const editorBounds = await editor(page).boundingBox();
              const panelBounds = await panel.boundingBox();
              assert.equal(panelBounds.x, 0);
              assert.equal(panelBounds.width, width);
              const bottomGutter = await page
                .locator("#workspace-panel-skills > div")
                .evaluate((el) =>
                  parseFloat(getComputedStyle(el).paddingBottom)
                );
              assert(
                Math.abs(
                  editorBounds.y +
                    editorBounds.height -
                    (panelBounds.y + panelBounds.height - bottomGutter)
                ) <= 2,
                "editor actions reach the bottom workspace gutter"
              );
              const saveBounds = await editor(page)
                .getByRole("button", { name: "Save", exact: true })
                .boundingBox();
              assert(
                saveBounds.y - (sourceBounds.y + sourceBounds.height) < 80,
                "source canvas uses the space above draft actions"
              );
              if (width === 1440 && height === 1000)
                await panel.screenshot({
                  path: join(EVIDENCE, `desktop-editor-source-${theme}.png`),
                  animations: "disabled",
                });
              await editor(page)
                .getByRole("button", { name: "Preview", exact: true })
                .click();
              const preview = page.getByLabel("Markdown preview of SKILL.md");
              const previewBounds = await preview.boundingBox();
              assert(
                Math.abs(previewBounds.height - sourceBounds.height) <= 2,
                "preview uses the same canvas height as source"
              );
              await panel.screenshot({
                path: join(EVIDENCE, `${width}x${height}-canvas-${theme}.png`),
                animations: "disabled",
              });
            }
          }
          assert(
            Math.abs(heights[1] - heights[0] - 440) <= 2,
            "440 extra viewport pixels become 440 extra editing pixels"
          );
          await editor(page)
            .getByRole("button", { name: "Source", exact: true })
            .click();
          const longContent = source(
            "my-skill",
            Array.from({ length: 160 }, (_, i) => `Instruction ${i + 1}.`).join(
              "\n\n"
            )
          );
          const before = await content(page).boundingBox();
          await content(page).fill(longContent);
          const after = await content(page).boundingBox();
          assert.equal(after.height, before.height);
          assert(
            await content(page).evaluate(
              (el) => el.scrollHeight > el.clientHeight
            ),
            "long source scrolls inside its canvas"
          );
          await editor(page)
            .getByRole("button", { name: "Preview", exact: true })
            .click();
          const preview = page.getByLabel("Markdown preview of SKILL.md");
          assert(
            await preview.evaluate((el) => el.scrollHeight > el.clientHeight),
            "long preview scrolls inside its canvas"
          );
          assert.equal((await preview.boundingBox()).height, before.height);
          page.once("dialog", (dialog) => dialog.accept());
          await browseSkills(page);
          await page
            .getByRole("button", {
              name: "Expand workspace panel",
              exact: true,
            })
            .waitFor();
          assert((await panel.boundingBox()).width < 1000);
          assert.equal(await page.locator("#chat").getAttribute("inert"), null);
          policy.packages.get("p1").files[0].content = longContent;
          await selectCatalogSkill(page, /my-skill Personal/);
          const detailsPreview = page.getByLabel(
            "Markdown preview of SKILL.md"
          );
          assert(
            await detailsPreview.evaluate(
              (el) => el.scrollHeight > el.clientHeight
            ),
            "long read-only skill content also scrolls within the available canvas"
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "all workspace and admin panels fill their shells and preserve tabs when expanded",
      async () => {
        const policy = skillsFixture();
        const originalRoute = policy.route;
        policy.route = (route, account) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/user/model")
            return json(route, {
              effective: {
                provider: "fixture",
                model: "example",
                effort: "low",
                thinking: false,
                max_tokens: 4096,
              },
              preset: null,
            });
          if (
            path === "/api/user/allowed-models" ||
            path.startsWith("/api/admin/tier-models/")
          )
            return json(route, { models: [] });
          if (path === "/api/user/connectivity")
            return json(route, {
              run_mode: "gateway",
              run_mode_source: "env",
              default_run_mode: "gateway",
              proxy_url: "",
              proxy_url_source: "env",
              available_modes: ["gateway", "proxy"],
            });
          if (path === "/api/user/tokens") return json(route, {});
          if (path === "/api/user/image-fetching")
            return json(route, {
              enabled: false,
              effective: false,
              sources: null,
            });
          if (
            [
              "/api/admin/scopes",
              "/api/admin/scm/servers",
              "/api/user/scm/servers",
            ].includes(path)
          )
            return json(route, []);
          if (path === "/api/admin/broadcasts")
            return json(route, { broadcasts: [] });
          if (
            path.startsWith("/api/") &&
            ![
              "/api/user/profile",
              "/api/user/notifications",
              "/api/user/tool-permissions",
              "/api/admin/tool-permissions",
              "/api/admin/users",
              "/api/admin/registration-settings",
              "/api/admin/invitation-codes",
            ].includes(path) &&
            !path.startsWith("/api/skills") &&
            !path.includes("/assistants/")
          )
            return json(
              route,
              { detail: "Unavailable in this layout fixture" },
              503
            );
          return originalRoute(route, account);
        };
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          for (const [width, height] of [
            [1440, 1000],
            [375, 812],
          ]) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (theme) =>
                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  ),
                theme
              );
              for (const [id, label] of [
                ["models", "Models"],
                ["tools", "Tools"],
                ["skills", "Skills"],
                ["tokens", "Tokens"],
                ["connectivity", "Connections"],
              ]) {
                await page
                  .getByRole("tab", { name: label, exact: true })
                  .click();
                const panel = page.locator("#right-panel");
                const body = page.locator(`#workspace-panel-${id}`);
                const docked = await panel.boundingBox();
                const bodyBounds = await body.boundingBox();
                assert(
                  Math.abs(bodyBounds.y + bodyBounds.height - height) <= 1
                );
                assert.equal(
                  await panel.evaluate(
                    (el) => el.scrollWidth <= el.clientWidth + 1
                  ),
                  true
                );
                await page
                  .getByRole("button", { name: "Expand workspace panel" })
                  .click();
                const expanded = await panel.boundingBox();
                assert.equal(expanded.x, 0);
                assert.equal(expanded.width, width);
                assert.equal(
                  await page
                    .getByRole("tab", { name: label, exact: true })
                    .getAttribute("aria-selected"),
                  "true"
                );
                await page
                  .getByRole("button", { name: "Restore workspace panel" })
                  .click();
                assert.deepEqual(await panel.boundingBox(), docked);
              }
            }
          }
          await page
            .getByRole("button", { name: "Close workspace panel" })
            .click();
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          for (const [width, height] of [
            [1440, 1000],
            [375, 812],
          ]) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (theme) =>
                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  ),
                theme
              );
              for (const label of [
                "People",
                "Models",
                "Tools",
                "Runtime",
                "Memories",
                "Search",
                "Sources",
                "Newsletters",
              ]) {
                await page
                  .getByRole("tab", { name: label, exact: true })
                  .click();
                const panel = page.locator("#admin-panel");
                const scroll = panel.locator(
                  '[data-slot="scroll-area-viewport"]'
                );
                const docked = await panel.boundingBox();
                const scrollBounds = await scroll.boundingBox();
                assert(
                  Math.abs(scrollBounds.y + scrollBounds.height - height) <= 1
                );
                assert.equal(
                  await panel.evaluate(
                    (el) => el.scrollWidth <= el.clientWidth + 1
                  ),
                  true
                );
                await page
                  .getByRole("button", { name: "Expand admin panel" })
                  .click();
                const expanded = await panel.boundingBox();
                assert.equal(expanded.x, 0);
                assert.equal(expanded.width, width);
                assert.equal(
                  await page
                    .getByRole("tab", { name: label, exact: true })
                    .getAttribute("aria-selected"),
                  "true"
                );
                if (label === "Newsletters")
                  await panel.screenshot({
                    path: join(
                      EVIDENCE,
                      `${width}-admin-expanded-${theme}.png`
                    ),
                    animations: "disabled",
                  });
                await page
                  .getByRole("button", { name: "Restore admin panel" })
                  .click();
                assert.deepEqual(await panel.boundingBox(), docked);
              }
            }
          }
          await page
            .getByRole("button", { name: "Expand admin panel" })
            .click();
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          assert.equal(await page.locator("#chat").getAttribute("inert"), null);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "import preview can be cancelled without a discard prompt and returns keyboard focus",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        let prompts = 0;
        page.on("dialog", (d) => {
          prompts += 1;
          void d.dismiss();
        });
        try {
          await openSkills(page);
          await selectPersonal(page);
          const unsaved = source("my-skill", "RETAIN THIS DRAFT");
          await content(page).fill(unsaved);
          const trigger = page.getByRole("button", {
            name: "Import",
            exact: true,
          });
          await trigger.click();
          const dialog = page.getByRole("dialog", {
            name: "Import skill package",
          });
          await dialog.waitFor();
          assert.equal(prompts, 0);
          await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await dialog.waitFor({ state: "hidden" });
          assert.equal(await content(page).inputValue(), unsaved);
          assert.equal(
            await trigger.evaluate((el) => el === document.activeElement),
            true
          );
          await trigger.click();
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "SKILL.md",
            mimeType: "text/markdown",
            buffer: Buffer.from(source("imported-skill")),
          });
          await dialog
            .getByRole("button", { name: "Open draft", exact: true })
            .click();
          assert.equal(prompts, 1);
          await dialog
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await dialog.waitFor({ state: "hidden" });
          assert.equal(await content(page).inputValue(), unsaved);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "explicit imported replacement preserves stable identity and replaces all files only on Save",
      async () => {
        const policy = skillsFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        const imported = [
          {
            path: "SKILL.md",
            content: source("my-skill", "IMPORTED COMPLETE DRAFT"),
          },
          { path: "references/new.md", content: "ADDED RESOURCE" },
        ];
        policy.setImportFiles(imported);
        try {
          await openSkills(page);
          policy.packages.set("p1", {
            ...policy.packages.get("p1"),
            revision: 7,
            files: [
              ...policy.packages.get("p1").files,
              { path: "removed.md", content: "REMOVE ME" },
            ],
          });
          await page
            .getByRole("button", { name: "Import", exact: true })
            .click();
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "update.zip",
            mimeType: "application/zip",
            buffer: Buffer.from("fixture"),
          });
          await page.getByText("my-skill", { exact: true }).last().waitFor();
          assert.equal(
            await page.getByLabel("Import destination").inputValue(),
            ""
          );
          await page.getByLabel("Import destination").selectOption("p1");
          await page
            .getByText(/Replace my-skill · revision 7\. All saved files/)
            .waitFor();
          assert.equal(
            await page
              .getByText(/This name is already in use\. Choose a distinct name/)
              .count(),
            0
          );
          await captureMatrix(
            page,
            "import-replacement",
            page.getByRole("dialog", { name: "Import skill package" })
          );
          await page
            .getByRole("button", { name: "Open draft", exact: true })
            .click();
          assert.equal(
            policy.requests.filter((r) => r.method === "PUT").length,
            0
          );
          assert.equal(
            policy.packages
              .get("p1")
              .files.some((f) => f.path === "removed.md"),
            true
          );
          assert.equal(
            await editor(page)
              .getByRole("button", { name: "removed.md", exact: true })
              .count(),
            0
          );
          await editor(page)
            .getByText("references/new.md", { exact: true })
            .waitFor();
          await page
            .getByText(/Saving replaces my-skill · revision 7/)
            .waitFor();
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page.getByText("Skill saved.", { exact: true }).waitFor();
          const put = policy.requests.filter((r) => r.method === "PUT");
          assert.equal(put.length, 1);
          assert.equal(put[0].path, "/api/skills/personal/p1");
          assert.equal(JSON.parse(put[0].body).expected_revision, 7);
          assert.deepEqual(policy.packages.get("p1").files, imported);
          assert.equal(policy.packages.get("p1").revision, 8);
          assert.equal(
            await page.getByRole("button", { name: "Copy as draft" }).count(),
            0
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "cancelled replacement fetch and stale imported Save keep the appropriate draft",
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
            .getByRole("button", { name: "Import", exact: true })
            .click();
          const delayed = policy.delayRead();
          await page.getByLabel("Import destination").selectOption("p1");
          await page
            .getByText("Loading current replacement package…")
            .waitFor();
          await page
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          delayed.release();
          assert.equal(await editor(page).count(), 0);
          await page
            .getByRole("button", { name: "Import", exact: true })
            .click();
          assert.equal(
            await page.getByLabel("Import destination").inputValue(),
            ""
          );
          await page.getByLabel("Import destination").selectOption("p1");
          await page
            .getByText(/Replace my-skill · revision 1\. All saved files/)
            .waitFor();
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "SKILL.md",
            mimeType: "text/markdown",
            buffer: Buffer.from(source("imported-skill")),
          });
          await page
            .getByRole("button", { name: "Open draft", exact: true })
            .click();
          policy.conflict();
          const unsaved = await content(page).inputValue();
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page
            .getByRole("button", { name: "View latest version" })
            .waitFor();
          assert.equal(await content(page).inputValue(), unsaved);
          assert.equal(
            policy.requests.filter((r) => r.method === "PUT").length,
            1
          );
          assert.equal(
            JSON.parse(policy.requests.find((r) => r.method === "PUT").body)
              .expected_revision,
            1
          );
          assert.equal(policy.packages.get("p1").revision, 2);
          await page
            .getByRole("button", { name: "View latest version" })
            .click();
          await page
            .getByRole("heading", { name: /Latest saved version · revision 2/ })
            .waitFor();
          assert.equal(await content(page).inputValue(), unsaved);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    for (const requestType of ["target", "upload"])
      await t.test(
        `account switch during import ${requestType} discards late private results`,
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
              .getByRole("button", { name: "Import", exact: true })
              .click();
            const delayed =
              requestType === "target"
                ? policy.delayRead()
                : policy.delayImport();
            if (requestType === "target") {
              await page.getByLabel("Import destination").selectOption("p1");
              await page
                .getByText("Loading current replacement package…")
                .waitFor();
            } else {
              await page.getByLabel("Skill file or ZIP").setInputFiles({
                name: "SKILL.md",
                mimeType: "text/markdown",
                buffer: Buffer.from("fixture"),
              });
              await page.getByText("Validating package…").waitFor();
            }
            // Exercise the live auth-store guard before the account-keyed render.
            await page.evaluate(() => {
              const user = JSON.parse(localStorage.getItem("deep-agent-auth"));
              localStorage.setItem(
                "deep-agent-auth",
                JSON.stringify({
                  ...user,
                  user_id: "account-b",
                  username: "account-b",
                })
              );
            });
            const completed = page.waitForResponse((response) =>
              response
                .url()
                .endsWith(
                  requestType === "target"
                    ? "/api/skills/personal/p1"
                    : "/api/skills/import/preview"
                )
            );
            delayed.release();
            await completed;
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve))
                )
            );
            assert.equal(
              await page
                .getByRole("button", { name: "Open draft", exact: true })
                .isDisabled(),
              true
            );
            assert.equal(
              await page
                .getByText(/Replace my-skill · revision 1\. All saved files/)
                .count(),
              0
            );
            assert.equal(
              await page
                .getByRole("heading", { name: "imported-skill", exact: true })
                .count(),
              0
            );
            await page
              .getByRole("button", { name: "Cancel", exact: true })
              .click();
            await switchAccount(page, policy);
            await page
              .getByRole("button", { name: "Import", exact: true })
              .click();
            assert.equal(
              await page.getByLabel("Import destination").inputValue(),
              ""
            );
            assert.equal(
              await page
                .getByText(/Replace my-skill · revision 1\. All saved files/)
                .count(),
              0
            );
            assert.equal(
              await page
                .getByRole("button", { name: "Open draft", exact: true })
                .isDisabled(),
              true
            );
            assert.equal(
              policy.requests.filter(
                (r) =>
                  ["PUT", "POST"].includes(r.method) &&
                  r.path !== "/api/skills/import/preview"
              ).length,
              0
            );
            assert.deepEqual(pageErrors, []);
          } finally {
            await context.close();
          }
        }
      );
    for (const scenario of [
      "create",
      "import",
      "system-copy",
      "rename",
      "system-reserved",
    ])
      await t.test(
        `${scenario} name collision keeps draft without stale-version recovery`,
        async () => {
          const policy = skillsFixture();
          policy.packages.set("p2", personal("p2", "occupied"));
          const { page, context, pageErrors } = await authenticatedPage(
            browser,
            server,
            policy,
            "admin"
          );
          try {
            await openSkills(page);
            if (scenario === "import") {
              policy.setImportFiles([
                { path: "SKILL.md", content: source("occupied") },
              ]);
              await page
                .getByRole("button", { name: "Import", exact: true })
                .click();
              await page.getByLabel("Skill file or ZIP").setInputFiles({
                name: "SKILL.md",
                mimeType: "text/markdown",
                buffer: Buffer.from("fixture"),
              });
              await page
                .getByRole("button", { name: "Open draft", exact: true })
                .click();
            } else if (scenario === "system-copy") {
              await selectCatalogSkill(page, /system-skill System/);
              await page.getByRole("button", { name: "Copy as draft" }).click();
              policy.packages.set("p3", personal("p3", "system-skill-copy"));
            } else if (scenario === "rename") {
              await selectPersonal(page);
              await content(page).fill(source("occupied"));
            } else {
              await page
                .getByRole("button", { name: "New skill", exact: true })
                .click();
              await content(page).fill(
                source(
                  scenario === "system-reserved" ? "system-skill" : "occupied"
                )
              );
            }
            const retained = await content(page).inputValue();
            await editor(page)
              .getByRole("button", { name: "Save", exact: true })
              .click();
            await page
              .getByText(
                /This name is already in use\. Your draft is still here/
              )
              .waitFor();
            assert.equal(await content(page).inputValue(), retained);
            assert.equal(
              await page
                .getByRole("button", { name: "View latest version" })
                .count(),
              0
            );
            assert.equal(
              policy.requests.filter(
                (r) =>
                  r.method === "PUT" ||
                  (r.method === "POST" && r.path === "/api/skills/personal")
              ).length,
              1
            );
            await content(page).fill(source(`available-after-${scenario}`));
            await editor(page)
              .getByRole("button", { name: "Save", exact: true })
              .click();
            await page.getByText("Skill saved.", { exact: true }).waitFor();
            assert.equal(
              await page
                .getByText(
                  /This name is already in use\. Your draft is still here/
                )
                .count(),
              0
            );
            assert.deepEqual(pageErrors, []);
          } finally {
            await context.close();
          }
        }
      );
    await t.test(
      "copy suggests available name and deployment collision exposes explicit Rename",
      async () => {
        const policy = skillsFixture();
        policy.packages.set("p2", personal("p2", "system-skill-copy"));
        policy.packages.set("p3", personal("p3", "system-skill-copy-2"));
        policy.packages.set("p1", personal("p1", "system-skill"));
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await openSkills(page);
          await selectCatalogSkill(page, /system-skill System/);
          assert.equal(
            await page.getByLabel("Copy to personal library").inputValue(),
            "system-skill-copy-3"
          );
          await selectCatalogSkill(page, /system-skill Personal/);
          await page
            .getByText(
              /Discovery is paused until you rename this personal skill/
            )
            .waitFor();
          assert.equal(
            await page.getByRole("button", { name: "Copy as draft" }).count(),
            0
          );
          policy.setImportFiles([
            { path: "SKILL.md", content: source("system-skill") },
          ]);
          await page
            .getByRole("button", { name: "Import", exact: true })
            .click();
          await page.getByLabel("Import destination").selectOption("p1");
          await page
            .getByText(/Replace system-skill · revision 1\. All saved files/)
            .waitFor();
          await page.getByLabel("Skill file or ZIP").setInputFiles({
            name: "SKILL.md",
            mimeType: "text/markdown",
            buffer: Buffer.from("fixture"),
          });
          await page
            .getByText(/This name is already in use\. Choose a distinct name/)
            .waitFor();
          await page
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await page
            .getByRole("region", { name: "Skill details" })
            .scrollIntoViewIfNeeded();
          await captureMatrix(
            page,
            "deployment-name-conflict",
            page.locator("#right-panel")
          );
          await page
            .getByRole("button", { name: "Rename", exact: true })
            .click();
          await content(page).fill(source("renamed-after-deployment"));
          await editor(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await page.getByText("Skill saved.", { exact: true }).waitFor();
          assert.equal(
            policy.packages.get("p1").name,
            "renamed-after-deployment"
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
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
          await selectCatalogSkill(page, /system-skill System/);
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
          await page.getByRole("button", { name: "Back to skills" }).click();
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
          policy.failCatalog();
          await openSkills(page);
          await page
            .getByText("Catalog unavailable", { exact: true })
            .waitFor();
          assert.equal(await page.getByText(/No skills yet/).count(), 0);
          await page.getByRole("button", { name: "Retry catalog" }).click();
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
          await page.setViewportSize({ width: 320, height: 800 });
          await page
            .getByRole("button", { name: "Close workspace panel" })
            .click();
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") === "Workspace"
          );
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
