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
const TOOL_CATALOG = [
  ["send_email", "Send email", "Email", "Send an email through SMTP."],
  [
    "send_draft_email",
    "Send draft email",
    "Email",
    "Send an existing Outlook email draft.",
  ],
  [
    "create_draft_email",
    "Create draft email",
    "Email",
    "Create an Outlook email draft.",
  ],
  [
    "send_chat_message",
    "Send Teams message",
    "Teams",
    "Send a message in Microsoft Teams.",
  ],
  [
    "create_chat_with_user",
    "Create Teams chat",
    "Teams",
    "Create a Microsoft Teams chat with a user.",
  ],
  [
    "grade_vsda_ticket",
    "Grade VSDA ticket",
    "Jira",
    "Evaluate a VSDA ticket and compute its grade.",
  ],
  [
    "edit_jira_ticket",
    "Edit Jira ticket",
    "Jira",
    "Change fields on an existing Jira ticket.",
  ],
  [
    "add_jira_comment",
    "Add Jira comment",
    "Jira",
    "Add a comment to an existing Jira ticket.",
  ],
  [
    "trigger_jenkins_build",
    "Trigger Jenkins build",
    "Jenkins",
    "Start a Jenkins build.",
  ],
  [
    "save_scope_note",
    "Save shared note",
    "Shared memory",
    "Save a named note in a shared memory scope.",
  ],
  [
    "save_scope_preference",
    "Save shared preference",
    "Shared memory",
    "Save a preference or rule in a shared memory scope.",
  ],
  [
    "record_scope_history",
    "Record shared history",
    "Shared memory",
    "Record an event in a shared memory scope.",
  ],
  [
    "update_scope_context",
    "Update shared context",
    "Shared memory",
    "Update the summary for a shared memory scope.",
  ],
].map(([id, label, group, description]) => ({
  id,
  label,
  group,
  description,
  prerequisites:
    group === "Shared memory"
      ? "Requires developer or admin role and write access to the target scope."
      : null,
}));

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
    const connectivityPutBodies = [];
    let adminConnectivity = {
      run_mode: "gateway",
      run_mode_source: "env",
      embedding_provider: "native",
      embedding_provider_source: "env",
      urls: {},
      proxy_attachments_enabled: true,
      proxy_attachments_enabled_source: "env",
    };
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
      if (path === "/api/admin/connectivity") {
        if (request.method() === "PUT") {
          const body = request.postDataJSON();
          connectivityPutBodies.push(body);
          adminConnectivity = {
            ...adminConnectivity,
            ...body,
            ...(Object.hasOwn(body, "proxy_attachments_enabled")
              ? { proxy_attachments_enabled_source: "database" }
              : {}),
            ...(Object.hasOwn(body, "embedding_provider")
              ? { embedding_provider_source: "database" }
              : {}),
          };
        }
        return json(route, adminConnectivity);
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
      if (path === "/api/admin/users") {
        return json(route, {
          users: [
            { user_id: "admin-1", username: "browser-admin", role: "admin" },
            {
              user_id: "developer-1",
              username: "fixture-developer",
              role: "developer",
            },
          ],
        });
      }
      if (path.startsWith("/api/admin/token-usage/users/")) {
        return json(route, {
          used: 24000,
          limit: 100000,
          pct: 24,
          is_unlimited: false,
          display_reset: "Monday",
          calls_used: 12,
          calls_limit: 100,
          calls_pct: 12,
          calls_is_unlimited: false,
          cost_used_micros: 250000,
          cost_limit_micros: 1000000,
          cost_used_usd: 0.25,
          cost_limit_usd: 1,
          cost_pct: 25,
          cost_is_unlimited: false,
          enforced: "tokens",
        });
      }
      if (path === "/api/admin/registration-settings") {
        return json(route, { require_invitation_code: true });
      }
      if (path === "/api/admin/invitation-codes") {
        return json(route, { codes: [] });
      }
      if (path.startsWith("/api/admin/tier-models/")) {
        return json(route, { tier: path.split("/").at(-1), models: [] });
      }
      if (path === "/api/admin/weekly-limit-settings") {
        return json(route, {
          token_enabled: true,
          call_enabled: true,
          cost_enabled: true,
        });
      }
      if (path.includes("/api/admin/tier-token-limits/")) {
        return json(route, {
          tier: path.split("/").at(-1),
          weekly_limit: 100000,
        });
      }
      if (path.includes("/api/admin/tier-call-limits/")) {
        return json(route, {
          tier: path.split("/").at(-1),
          weekly_limit: 100,
        });
      }
      if (path.includes("/api/admin/tier-cost-limits/")) {
        return json(route, {
          tier: path.split("/").at(-1),
          weekly_limit_micros: 1000000,
        });
      }
      if (path === "/api/admin/tool-permissions") {
        const allowed = TOOL_CATALOG.map((tool) => tool.id);
        return json(route, {
          catalog: TOOL_CATALOG,
          tiers: Object.fromEntries(
            ["user", "developer", "admin"].map((tier) => [
              tier,
              { tier, allowed_tool_ids: allowed, revision: 1 },
            ])
          ),
        });
      }
      if (path === "/api/admin/run-mode") {
        return json(route, {
          run_mode: "gateway",
          run_mode_updated_at: "2026-09-11T12:00:00Z",
          run_mode_time_gap: "just now",
        });
      }
      if (path === "/api/admin/scopes") return json(route, []);
      if (path === "/api/library/indices") {
        return json(route, { indices: [] });
      }
      if (path === "/api/library/shelves") {
        return json(route, { shelves: [] });
      }
      if (path === "/api/library/shelves/audit") {
        return json(route, { shelves: [], drift: [] });
      }
      if (path === "/api/library/jobs") return json(route, { jobs: [] });
      if (path === "/api/library/batches") {
        return json(route, { batches: [] });
      }
      if (path === "/api/admin/scm/servers") return json(route, []);
      if (path === "/api/admin/broadcasts") {
        return json(route, { broadcasts: [] });
      }
      if (path === "/api/admin/code-analysis/settings") {
        return json(route, {});
      }
      if (path === "/api/admin/code-analysis/engine-settings") {
        return json(route, {});
      }
      if (path === "/api/code-analysis/engines") {
        return json(route, {
          default_engine: "copilot",
          engines: [
            { id: "deep_agent", ready: true, blockers: [] },
            { id: "copilot", ready: true, blockers: [] },
          ],
        });
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

      const adminTabs = page.getByRole("tablist", {
        name: "Admin sections",
      });
      const expectedTabs = [
        "People",
        "Models",
        "Tools",
        "Runtime",
        "Memories",
        "Search",
        "Sources",
        "Newsletters",
      ];
      await adminTabs.waitFor();
      await adminTabs
        .getByRole("tab", { name: "People", exact: true })
        .waitFor();
      assert.equal(await adminTabs.getByRole("tab").count(), 8);
      for (const label of expectedTabs) {
        await adminTabs
          .getByRole("tab", { name: label, exact: true })
          .waitFor();
      }
      const assertAdminTabBounds = async (viewport) => {
        const result = await adminTabs.evaluate((list) => ({
          clientWidth: list.clientWidth,
          scrollWidth: list.scrollWidth,
          labels: [...list.querySelectorAll('[role="tab"]')].map((tab) => ({
            label: tab.textContent?.trim(),
            clientWidth: tab.clientWidth,
            scrollWidth: tab.scrollWidth,
            tabBounds: tab.getBoundingClientRect().toJSON(),
            iconBounds: tab
              .querySelector("svg")
              ?.getBoundingClientRect()
              .toJSON(),
            textBounds: (() => {
              const textNode = [...tab.childNodes].find(
                (node) =>
                  node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
              );
              if (!textNode) return null;
              const range = document.createRange();
              range.selectNode(textNode);
              return range.getBoundingClientRect().toJSON();
            })(),
          })),
        }));
        assert(
          result.scrollWidth <= result.clientWidth + 1,
          `${viewport} admin tabs overflowed: ${JSON.stringify(result)}`
        );
        for (const tab of result.labels) {
          assert(
            tab.scrollWidth <= tab.clientWidth + 1,
            `${viewport} tab label clipped: ${JSON.stringify(tab)}`
          );
          assert(
            tab.textBounds && tab.textBounds.width > 0,
            `${viewport} tab label is hidden: ${JSON.stringify(tab)}`
          );
          assert(
            tab.textBounds.left >= tab.tabBounds.left - 1 &&
              tab.textBounds.right <= tab.tabBounds.right + 1,
            `${viewport} tab label escaped its button: ${JSON.stringify(tab)}`
          );
          if (tab.iconBounds && tab.iconBounds.width > 0) {
            const bounds = tab.iconBounds;
            assert(
              bounds.left >= tab.tabBounds.left - 1 &&
                bounds.right <= tab.tabBounds.right + 1,
              `${viewport} tab icon escaped its button: ${JSON.stringify(tab)}`
            );
          }
        }
      };
      await assertAdminTabBounds("desktop");

      await page.getByText("2 accounts in this workspace").waitFor();
      const registrationSummary = page
        .locator("details")
        .filter({ hasText: /Registration & invitations/ })
        .locator("summary");
      await registrationSummary.waitFor();
      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-people-desktop.png"),
        animations: "disabled",
      });
      await registrationSummary.click();
      await page
        .getByRole("switch", {
          name: "Require invitation code for registration",
        })
        .waitFor();
      await page
        .getByRole("button", { name: "Generate invitation code" })
        .waitFor();
      await registrationSummary.click();
      const bulkSummary = page
        .locator("details")
        .filter({ hasText: /Bulk account operations/ })
        .locator("summary");
      await bulkSummary.click();
      await page
        .getByRole("button", { name: "Reset all weekly usage" })
        .waitFor();
      await page
        .getByRole("button", { name: "Reset all non-admin passwords" })
        .waitFor();
      await bulkSummary.click();

      const peopleTab = adminTabs.getByRole("tab", {
        name: "People",
        exact: true,
      });
      const modelsTab = adminTabs.getByRole("tab", {
        name: "Models",
        exact: true,
      });
      await peopleTab.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await peopleTab.getAttribute("aria-selected"), "true");
      assert.equal(await modelsTab.getAttribute("aria-selected"), "false");
      await page.keyboard.press("Enter");
      await page.getByText("Tier model allowlists").waitFor();
      await page.getByText("Usage limits", { exact: true }).waitFor();

      const toolsTab = adminTabs.getByRole("tab", {
        name: "Tools",
        exact: true,
      });
      await toolsTab.click();
      await page.getByRole("heading", { name: "Agent tools" }).waitFor();
      await page.getByRole("radio", { name: "developer", exact: true }).click();
      await page.getByText("Email", { exact: true }).waitFor();
      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-tools-compact-desktop.png"),
        animations: "disabled",
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "Switch to night mode" }).click();
      const darkTheme = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        darkClass: document.documentElement.classList.contains("dark"),
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      }));
      assert.equal(darkTheme.theme, "dark");
      assert.equal(darkTheme.darkClass, true);
      assert.notEqual(darkTheme.bodyBackground, "rgb(255, 255, 255)");
      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-tools-dark-reduced-motion.png"),
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Switch to day mode" }).click();
      await page.emulateMedia({ reducedMotion: "no-preference" });

      const runtimeTab = adminTabs.getByRole("tab", {
        name: "Runtime",
        exact: true,
      });
      await runtimeTab.click();
      await page.getByRole("heading", { name: "Run mode" }).waitFor();
      const providerEndpoints = page
        .locator("details")
        .filter({ hasText: /Provider endpoints/ });
      await providerEndpoints.locator("summary").click();
      await page.locator("#runtime-openai_base_url").waitFor();
      const executionResources = page
        .locator("details")
        .filter({ hasText: /Execution resources/ });
      await executionResources.locator("summary").click();
      await page.getByLabel("Default engine", { exact: true }).waitFor();
      assert.equal(
        await page.locator("#admin-panel").getByRole("alert").count(),
        0
      );
      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-runtime-desktop.png"),
        animations: "disabled",
      });

      await adminTabs
        .getByRole("tab", { name: "Memories", exact: true })
        .click();
      await page.getByRole("heading", { name: "Memories" }).last().waitFor();

      await adminTabs.getByRole("tab", { name: "Search", exact: true }).click();
      await page.getByRole("heading", { name: "Search library" }).waitFor();
      const copilotEmbedding = page.getByRole("button", {
        name: /Copilot API/,
      });
      await copilotEmbedding.click();
      await page
        .getByText("Custom override saved by an admin", { exact: true })
        .waitFor();
      assert.deepEqual(connectivityPutBodies.at(-1), {
        embedding_provider: "copilot",
      });
      await page
        .getByText("Embeddings now use copilot-api", { exact: true })
        .waitFor({ state: "hidden", timeout: 6_000 });

      await adminTabs
        .getByRole("tab", { name: "Newsletters", exact: true })
        .click();
      await page.getByRole("heading", { name: "Newsletters" }).last().waitFor();

      const sourcesTab = page.getByRole("tab", { name: "Sources" });
      await sourcesTab.focus();
      await page.keyboard.press("Enter");
      await assert.doesNotReject(() =>
        page.getByRole("heading", { name: "Source images" }).waitFor()
      );
      assert.equal(await sourcesTab.getAttribute("aria-selected"), "true");

      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-sources-overview-desktop.png"),
        animations: "disabled",
      });
      const serverConfiguration = page
        .locator("details")
        .filter({ hasText: /Server configuration/ })
        .locator("summary");
      await serverConfiguration.click();
      await page.getByRole("button", { name: "Save server" }).waitFor();
      await serverConfiguration.click();

      const attachmentSwitch = page.getByRole("switch", {
        name: "Chat file and image uploads",
      });
      await attachmentSwitch.waitFor();
      await attachmentSwitch.click();
      await page
        .getByText("Custom override saved by an admin", { exact: true })
        .waitFor();
      assert.deepEqual(connectivityPutBodies.at(-1), {
        proxy_attachments_enabled: false,
      });

      const sourceDisclosure = page
        .locator("details")
        .filter({ hasText: /Tier policies/ })
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

      await page.setViewportSize({ width: 375, height: 844 });
      await assertAdminTabBounds("375px");
      await page.setViewportSize({ width: 390, height: 844 });
      await assertAdminTabBounds("390px");
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
      await page.getByRole("heading", { name: "Connections" }).waitFor();
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
