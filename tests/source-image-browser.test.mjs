import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "out");
const EVIDENCE = join(ROOT, "docs", "evidence", "source-images");
const RUN_BROWSER = process.env.SOURCE_IMAGE_BROWSER_TEST === "1";
const SOURCE_IMAGE_BYTES =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAYAAABOzvzpAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAE2SURBVGhD5ZI5DgIxEAT9EiICAt7Ca4j4OIJkkZEajZq9bffY3qASR101DuH+GDx5vt4unC7XL4EHqeFhpYH44QKwON4PEWBKPtJ1gDlx0G2AJXHQXYA1V7d0E2CrOOgiwF75SNMBUsRBswFSxUFzAXJc3dJMgNzioIkAJcRB1QFKXd1SZQCFOKgugFI+Uk0AtTioIoCHOHAN4HV1S+AHBSw+3M5uyAPUJB+RBWBxvPMgNZIAY+KAB6kpGmDq6hYepKZIgDXigAepyR5grTjgQWqyBdhydQsPUpMcYK844EFqkgKkykd4kJpdAXKIAx6kZnOAXOKAB6lZHSDn1S08SM1igFLigAepmQ1QWj7Cg9SMBlCIAx6k5i+AShzwIDW/AMqrW3iQmuAlDniQmu8P8BAHPEjNB49qD8G9VROZAAAAAElFTkSuQmCC";
const SOURCE_ARTIFACT_PATH =
  "/_artifacts/admin/thread-1/uploads/source-a__diagram.png";
const SOURCE_STATE_KEY = "uploads/source-a__diagram.png";

const sourceRecord = {
  attachment_id: "source-a",
  artifact_path: SOURCE_ARTIFACT_PATH,
  state_files_key: SOURCE_STATE_KEY,
  filename: "diagram.png",
  mime_type: "image/png",
  byte_size: 417,
  source: "jira",
  source_container_id: "PROJECT-7",
  source_item_id: "ISSUE-42",
  source_page_url: "https://jira.example.test/browse/ISSUE-42",
  optimized_copy: true,
  content_digest: "sha256:fixture",
};

function checkpointState(files, records) {
  return {
    values: {
      messages: [
        {
          id: "message-1",
          type: "human",
          content: "Review the attached architecture diagram.",
          additional_kwargs: {
            attachments: [
              {
                path: SOURCE_ARTIFACT_PATH,
                name: "diagram.png",
                kind: "image",
                source_image_ref: {
                  attachment_id: sourceRecord.attachment_id,
                  artifact_path: SOURCE_ARTIFACT_PATH,
                },
              },
            ],
          },
        },
      ],
      todos: [],
      files,
      source_image_attachments: records,
    },
    next: [],
    tasks: [],
    metadata: {},
    created_at: "2026-09-10T12:00:00Z",
    checkpoint: {
      thread_id: "thread-1",
      checkpoint_ns: "",
      checkpoint_id: "checkpoint-1",
    },
    parent_checkpoint: null,
  };
}

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function sourcePolicy(tier, source) {
  return {
    tier,
    source,
    enabled: false,
    default_scope: "embedded",
    allow_all: false,
  };
}

function effectivePolicies() {
  return Object.fromEntries(
    ["jira", "polarion", "confluence"].map((source, index) => [
      source,
      {
        enabled: index === 0,
        default_scope: "embedded",
        allow_all: index === 0,
        effective_enabled: index === 0,
      },
    ])
  );
}

async function staticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (relative === "chat" || relative === "chat/") relative = "";
      if (relative.startsWith("chat/")) relative = relative.slice(5);
      if (!relative) relative = "index.html";
      let file = join(OUT, relative);
      try {
        if (!(await stat(file)).isFile()) throw new Error("not a file");
      } catch {
        file = join(OUT, "index.html");
      }
      const bytes = await readFile(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    baseUrl: `${origin}/chat/`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

test(
  "rendered source policy and attachment controls preserve their browser contracts",
  { skip: !RUN_BROWSER },
  async () => {
    const playwrightModule =
      process.env.SOURCE_IMAGE_PLAYWRIGHT_MODULE ?? "playwright";
    const { chromium } = await import(playwrightModule);
    await stat(join(OUT, "index.html"));
    await mkdir(EVIDENCE, { recursive: true });

    const fixture = await staticServer();
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.SOURCE_IMAGE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.SOURCE_IMAGE_BROWSER_EXECUTABLE }
        : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    const page = await context.newPage();
    const pageErrors = [];
    const seenRequests = [];
    const putBodies = [];
    let failNextSource = null;
    let imageFetchingReads = 0;
    const policies = new Map();
    let liveFiles = { [SOURCE_ARTIFACT_PATH]: SOURCE_IMAGE_BYTES };
    let liveRecords = { [sourceRecord.attachment_id]: sourceRecord };
    let deleteMode = "busy";
    const deleteRequests = [];
    const submittedRuns = [];

    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ exp: 4102444800 }))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      localStorage.setItem(
        "deep-agent-auth",
        JSON.stringify({
          user_id: "admin-1",
          username: "browser-admin",
          role: "admin",
          email: "admin@example.test",
          access_token: `e30.${payload}.sig`,
        })
      );
      localStorage.setItem(
        "deep-agent-config",
        JSON.stringify({ assistantId: "mock-graph" })
      );
      localStorage.setItem("vsda_token_setup_dismissed_admin-1", "1");
    });

    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (
        request.resourceType() === "fetch" ||
        request.resourceType() === "xhr"
      ) {
        seenRequests.push(`${request.method()} ${path}`);
      }
      const isFixtureAsset =
        url.origin === fixture.origin && !path.startsWith("/api/");
      if (isFixtureAsset) return route.continue();

      if (path === "/api/user/profile") {
        return json(route, {
          user_id: "admin-1",
          username: "browser-admin",
          role: "admin",
          email: "admin@example.test",
          has_graph_api_token: true,
          has_jira_api_token: true,
        });
      }
      if (path === "/api/user/connectivity") {
        return json(route, {
          run_mode: "gateway",
          default_run_mode: "gateway",
          run_mode_source: "default",
          proxy_url: "",
          default_proxy_url: "",
          proxy_url_source: "default",
          proxy_attachments_enabled: true,
        });
      }
      if (path === "/api/user/image-fetching") {
        if (request.method() === "GET") {
          imageFetchingReads += 1;
          if (imageFetchingReads === 1) {
            return json(route, { detail: "Fixture policy read failed" }, 503);
          }
        }
        return json(route, {
          enabled: true,
          effective: true,
          sources: effectivePolicies(),
        });
      }
      if (path === "/api/admin/users") return json(route, { users: [] });
      if (path.startsWith("/api/admin/tier-models/")) {
        return json(route, { tier: path.split("/").at(-1), models: [] });
      }
      const policyMatch = path.match(
        /^\/api\/admin\/tier-source-images\/([^/]+)\/(jira|polarion|confluence)$/
      );
      if (policyMatch) {
        const [, tier, source] = policyMatch;
        const key = `${tier}/${source}`;
        const current = policies.get(key) ?? sourcePolicy(tier, source);
        if (request.method() === "GET") return json(route, current);

        const body = request.postDataJSON();
        putBodies.push({ tier, source, body });
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
        if (failNextSource === source) {
          failNextSource = null;
          return json(route, { detail: "Simulated save failure" }, 500);
        }
        const saved = { tier, source, ...body };
        policies.set(key, saved);
        return json(route, saved);
      }
      if (path.endsWith("/assistants/search")) {
        return json(route, [
          {
            assistant_id: "assistant-1",
            graph_id: "mock-graph",
            created_at: "2026-09-10T12:00:00Z",
            updated_at: "2026-09-10T12:00:00Z",
            config: {},
            metadata: { created_by: "system" },
            version: 1,
            name: "Fixture assistant",
            context: {},
          },
        ]);
      }
      if (path === "/api/user/notifications") {
        return json(route, []);
      }
      if (path === "/threads/thread-1/history") {
        return json(route, [checkpointState(liveFiles, liveRecords)]);
      }
      if (path === "/threads/thread-1/state") {
        return json(route, checkpointState(liveFiles, liveRecords));
      }
      if (path === "/threads/thread-1/runs/stream") {
        submittedRuns.push(request.postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: "event: end\ndata: {}\n\n",
        });
      }
      if (
        path ===
        `/api/threads/thread-1/uploads/${encodeURIComponent(SOURCE_STATE_KEY)}`
      ) {
        deleteRequests.push({ mode: deleteMode, method: request.method() });
        if (deleteMode === "busy") {
          return json(route, { detail: "Thread has an active run" }, 409);
        }
        if (deleteMode === "error") {
          return json(route, { detail: "Simulated deletion failure" }, 500);
        }
        liveFiles = {};
        liveRecords = {};
        return json(route, { deleted: true });
      }
      if (path.startsWith("/api/")) return json(route, {});
      if (
        request.resourceType() === "fetch" ||
        request.resourceType() === "xhr"
      ) {
        return json(route, {});
      }
      return route.abort();
    });

    try {
      await page.goto(fixture.baseUrl, { waitUntil: "domcontentloaded" });
      const setupDialog = page.getByRole("dialog");
      if (await setupDialog.isVisible().catch(() => false)) {
        await setupDialog.getByRole("button", { name: "Set up later" }).click();
        await setupDialog.waitFor({ state: "hidden" });
      }
      const adminButton = page.getByRole("button", { name: "Admin console" });
      try {
        await adminButton.waitFor({ timeout: 8_000 });
      } catch {
        throw new Error(
          `Authenticated shell did not render: ${JSON.stringify({
            url: page.url(),
            body: (await page.locator("body").innerText()).slice(0, 800),
            pageErrors,
            seenRequests,
          })}`
        );
      }
      await adminButton.click();

      const modelsTab = page.getByRole("tab", { name: "Models" });
      await modelsTab.focus();
      await page.keyboard.press("Enter");
      await assert.doesNotReject(() =>
        page.getByText("Tier model allowlists").waitFor()
      );
      assert.equal(await modelsTab.getAttribute("aria-selected"), "true");

      const sourceDisclosure = page
        .locator("details")
        .filter({ hasText: /Source images/ })
        .locator("summary");
      await sourceDisclosure.focus();
      await page.keyboard.press("Enter");
      const userSection = page.locator(
        'section[aria-labelledby="source-image-tier-user"]'
      );
      await userSection.getByText("Jira", { exact: true }).waitFor();
      assert.equal(
        await userSection.getByText(/^(Issue|Work item|Page) content$/).count(),
        3
      );

      const jiraEnabled = userSection.getByRole("switch", {
        name: "Jira source images for user tier",
      });
      const jiraDefault = userSection.getByRole("combobox", {
        name: "Default Jira image fetch for user tier",
      });
      const jiraAllowAll = userSection.getByRole("switch", {
        name: "Allow user users to fetch all Jira images",
      });
      assert.equal(await jiraDefault.isDisabled(), true);
      assert.equal(await jiraAllowAll.isDisabled(), true);

      await jiraEnabled.focus();
      await page.keyboard.press("Space");
      const jiraCard = jiraEnabled.locator("xpath=ancestor::div[@aria-busy]");
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-busy") === "true",
        await jiraCard.elementHandle()
      );
      assert.equal(await jiraEnabled.isDisabled(), true);
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-busy") === "false",
        await jiraCard.elementHandle()
      );
      assert.equal(await jiraDefault.isEnabled(), true);

      await jiraDefault.focus();
      await page.keyboard.press("Enter");
      const allAttachmentsOption = page.getByRole("option", {
        name: "All attachments",
      });
      await allAttachmentsOption.waitFor();
      await allAttachmentsOption.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-busy") === "false",
        await jiraCard.elementHandle()
      );
      assert.equal(await jiraDefault.textContent(), "All attachments");
      assert.equal(await jiraAllowAll.getAttribute("aria-checked"), "true");
      const allBody = putBodies.find(
        (entry) => entry.source === "jira" && entry.body.default_scope === "all"
      );
      assert.deepEqual(allBody?.body, {
        enabled: true,
        default_scope: "all",
        allow_all: true,
      });

      await jiraAllowAll.focus();
      await page.keyboard.press("Space");
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-busy") === "false",
        await jiraCard.elementHandle()
      );
      assert.equal(await jiraDefault.textContent(), "Embedded");
      assert.equal(await jiraAllowAll.getAttribute("aria-checked"), "false");

      const adminPanel = page.locator("#admin-panel");
      await userSection.scrollIntoViewIfNeeded();
      await adminPanel.screenshot({
        path: join(EVIDENCE, "admin-source-controls-healthy.png"),
      });

      const confluenceEnabled = userSection.getByRole("switch", {
        name: "Confluence source images for user tier",
      });
      const polarionEnabled = userSection.getByRole("switch", {
        name: "Polarion source images for user tier",
      });
      failNextSource = "confluence";
      await confluenceEnabled.focus();
      await page.keyboard.press("Space");
      const confluenceCard = confluenceEnabled.locator(
        "xpath=ancestor::div[@aria-busy]"
      );
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-busy") === "true",
        await confluenceCard.elementHandle()
      );
      await userSection
        .getByRole("alert")
        .filter({ hasText: "Simulated save failure" })
        .waitFor();
      assert.equal(
        await confluenceEnabled.getAttribute("aria-checked"),
        "false"
      );
      assert.equal(await polarionEnabled.getAttribute("aria-checked"), "false");

      await userSection.scrollIntoViewIfNeeded();
      await adminPanel.screenshot({
        path: join(EVIDENCE, "admin-source-controls-desktop.png"),
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await userSection.scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `narrow page overflowed: ${JSON.stringify(overflow)}`
      );
      const sourceOverflow = await userSection.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      assert(
        sourceOverflow.scrollWidth <= sourceOverflow.clientWidth + 1,
        `source rows overflowed: ${JSON.stringify(sourceOverflow)}`
      );
      const enabledBox = await jiraEnabled.boundingBox();
      const defaultBox = await jiraDefault.boundingBox();
      const allowAllBox = await jiraAllowAll.boundingBox();
      assert(enabledBox && defaultBox && allowAllBox);
      assert(
        defaultBox.x > enabledBox.x + enabledBox.width &&
          allowAllBox.y > enabledBox.y + enabledBox.height,
        "narrow layout should keep primary controls readable in two columns"
      );
      await page.screenshot({
        path: join(EVIDENCE, "admin-source-controls-narrow.png"),
      });

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("button", { name: "Close admin panel" }).click();
      await page.evaluate(() =>
        localStorage.setItem("vsda_workspace_tab", "connectivity")
      );
      await page.getByRole("button", { name: "Workspace" }).click();
      await page.getByRole("heading", { name: "Connectivity" }).waitFor();
      const policyAlert = page.getByRole("alert").filter({
        hasText: "Source image preference could not be loaded",
      });
      await policyAlert.waitFor();
      const unknownSwitch = page.getByRole("switch", {
        name: "Include source images (status unavailable)",
      });
      assert.equal(await unknownSwitch.isDisabled(), true);

      const retry = policyAlert.getByRole("button", { name: "Retry" });
      await retry.focus();
      await page.keyboard.press("Enter");
      const hydratedSwitch = page.getByRole("switch", {
        name: "Include source images",
      });
      await hydratedSwitch.waitFor();
      await page.waitForFunction(
        (element) => element instanceof HTMLButtonElement && !element.disabled,
        await hydratedSwitch.elementHandle()
      );
      assert.equal(await hydratedSwitch.isEnabled(), true);
      assert.equal(await hydratedSwitch.getAttribute("aria-checked"), "true");
      await page.locator("#right-panel").screenshot({
        path: join(EVIDENCE, "connectivity-source-policy-retry.png"),
      });

      await page.goto(`${fixture.baseUrl}?threadId=thread-1`, {
        waitUntil: "domcontentloaded",
      });
      const liveSourceLabel = page.getByText("Jira source image", {
        exact: true,
      });
      await liveSourceLabel.first().waitFor({ timeout: 8_000 });
      const livePreviewButton = page
        .getByRole("button", { name: "View diagram.png full size" })
        .first();
      const liveThumbnail = livePreviewButton.locator("img");
      await liveThumbnail.waitFor();
      assert.equal(
        await liveThumbnail.evaluate(
          (image) => image.complete && image.naturalWidth === 64
        ),
        true
      );
      await livePreviewButton.click();
      const previewDialog = page.getByRole("dialog");
      await previewDialog
        .getByText("Optimized for model", { exact: true })
        .waitFor();
      assert.equal(
        await previewDialog.getByRole("heading").textContent(),
        sourceRecord.filename
      );
      assert.equal(
        await previewDialog
          .getByRole("link", { name: "Open source" })
          .getAttribute("href"),
        sourceRecord.source_page_url
      );
      const dialogImage = previewDialog.locator("img");
      await dialogImage.waitFor();
      assert.equal(
        await dialogImage.evaluate(
          (image) => image.complete && image.naturalWidth === 64
        ),
        true
      );
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(EVIDENCE, "attachment-preview-live.png"),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await previewDialog.waitFor({ state: "hidden" });

      const attachFiles = page.getByRole("button", { name: "Attach files" });
      await attachFiles.click();
      await page
        .getByRole("menuitem", { name: /Reference existing file/ })
        .click();
      const referenceDialog = page.getByRole("dialog");
      await referenceDialog
        .getByRole("button", { name: /diagram\.png Jira source image/ })
        .click();
      await referenceDialog
        .getByRole("button", { name: "Add 1 reference" })
        .click();
      const attachmentList = page.getByRole("list", { name: "Attachments" });
      await attachmentList.getByText("Jira source image").waitFor();
      const runRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/threads/thread-1/runs/stream"
      );
      await page.getByRole("button", { name: "Send message" }).click();
      await runRequest;
      assert.equal(submittedRuns.length, 1);
      const submittedJson = JSON.stringify(submittedRuns[0]);
      assert.match(submittedJson, /"source_image_ref"/);
      assert.match(submittedJson, /"attachment_id":"source-a"/);
      assert.doesNotMatch(submittedJson, /data:image/);
      assert.doesNotMatch(submittedJson, new RegExp(SOURCE_IMAGE_BYTES));

      const filesTrigger = page
        .getByRole("button", { name: /Files \(State\)/ })
        .first();
      await filesTrigger.click();
      const fileCard = page.getByTitle(SOURCE_ARTIFACT_PATH);
      await fileCard.waitFor();
      const deleteButton = page.getByRole("button", {
        name: "Delete diagram.png",
      });

      deleteMode = "busy";
      await deleteButton.click();
      await page
        .getByText("Thread has an active run", { exact: true })
        .waitFor();
      await fileCard.waitFor();

      deleteMode = "error";
      await deleteButton.click();
      await page
        .getByText("Simulated deletion failure", { exact: true })
        .waitFor();
      await fileCard.waitFor();

      deleteMode = "success";
      await deleteButton.click();
      await page
        .getByText("Source image unavailable", { exact: true })
        .waitFor();
      assert.deepEqual(deleteRequests, [
        { mode: "busy", method: "DELETE" },
        { mode: "error", method: "DELETE" },
        { mode: "success", method: "DELETE" },
      ]);
      assert.equal(
        seenRequests.filter((entry) => entry === "POST /threads/thread-1/state")
          .length,
        0,
        "source deletion must not use the SDK state-update path"
      );
      await page.waitForFunction(
        () => document.querySelectorAll("[data-sonner-toast]").length === 0,
        undefined,
        { timeout: 10_000 }
      );
      await page.screenshot({
        path: join(EVIDENCE, "attachment-deleted-unavailable.png"),
        animations: "disabled",
      });

      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
      await browser.close();
      await fixture.close();
    }
  }
);
