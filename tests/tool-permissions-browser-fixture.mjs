import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { isStaticExportRequest } from "./browser-fixtures.mjs";

const OUT = resolve(import.meta.dirname, "..", "out");

export {
  OUT,
  staticServer,
  authenticatedPage,
  makePolicyFixture,
  deferred,
  json,
};

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const catalog = [
  {
    id: "send_email",
    label: "Send email",
    group: "Email",
    description: "Send an email through SMTP.",
    prerequisites: null,
  },
  {
    id: "send_draft_email",
    label: "Send draft email",
    group: "Email",
    description: "Send an existing Outlook email draft.",
    prerequisites: null,
  },
  {
    id: "create_draft_email",
    label: "Create draft email",
    group: "Email",
    description: "Create an Outlook email draft.",
    prerequisites: null,
  },
  {
    id: "send_chat_message",
    label: "Send Teams message",
    group: "Teams",
    description: "Send a message in Microsoft Teams.",
    prerequisites: null,
  },
  {
    id: "create_chat_with_user",
    label: "Create Teams chat",
    group: "Teams",
    description: "Create a Microsoft Teams chat with a user.",
    prerequisites: null,
  },
  {
    id: "grade_vsda_ticket",
    label: "Grade VSDA ticket",
    group: "Jira",
    description: "Evaluate a VSDA ticket and compute its grade.",
    prerequisites: null,
  },
  {
    id: "edit_jira_ticket",
    label: "Edit Jira ticket",
    group: "Jira",
    description: "Change fields on an existing Jira ticket.",
    prerequisites: null,
  },
  {
    id: "add_jira_comment",
    label: "Add Jira comment",
    group: "Jira",
    description: "Add a comment to an existing Jira ticket.",
    prerequisites: null,
  },
  {
    id: "trigger_jenkins_build",
    label: "Trigger Jenkins build",
    group: "Jenkins",
    description: "Start a Jenkins build.",
    prerequisites: null,
  },
  {
    id: "save_scope_note",
    label: "Save shared note",
    group: "Shared memory",
    description: "Save a named note in a shared memory scope.",
    prerequisites:
      "Requires developer or admin role and write access to the target scope.",
  },
  {
    id: "save_scope_preference",
    label: "Save shared preference",
    group: "Shared memory",
    description: "Save a preference or rule in a shared memory scope.",
    prerequisites:
      "Requires developer or admin role and write access to the target scope.",
  },
  {
    id: "record_scope_history",
    label: "Record shared history",
    group: "Shared memory",
    description: "Record an event in a shared memory scope.",
    prerequisites:
      "Requires developer or admin role and write access to the target scope.",
  },
  {
    id: "update_scope_context",
    label: "Update shared context",
    group: "Shared memory",
    description: "Update the summary for a shared memory scope.",
    prerequisites:
      "Requires developer or admin role and write access to the target scope.",
  },
];
const allToolIds = catalog.map((tool) => tool.id);

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
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
        file = extname(relative) ? join(OUT, "index.html") : `${file}.html`;
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

function makePolicyFixture() {
  const tiers = {
    user: { tier: "user", allowed_tool_ids: [], revision: 1 },
    developer: {
      tier: "developer",
      allowed_tool_ids: [...allToolIds],
      revision: 1,
    },
    admin: { tier: "admin", allowed_tool_ids: [...allToolIds], revision: 1 },
  };
  const selections = new Map();
  const selectionRevisions = new Map();
  const tierPutBodies = [];
  const userPutBodies = [];
  let conflictNextTierSave = null;
  let conflictNextPersonalSave = false;
  let failNextPersonalRead = false;
  let delayedPersonalSave = null;
  let nextProfileAccountId = null;

  const userResponse = (account) => {
    const allowed = tiers[account.role].allowed_tool_ids;
    const selected = selections.get(account.user_id) ?? allowed;
    return {
      catalog,
      tier: account.role,
      tier_revision: `${account.role}:${tiers[account.role].revision}`,
      selection_revision: selectionRevisions.get(account.user_id) ?? 0,
      allowed_tool_ids: [...allowed],
      selected_tool_ids: [...selected],
      effective_tool_ids: selected.filter((id) => allowed.includes(id)),
      blocked_tool_ids: selected.filter((id) => !allowed.includes(id)),
    };
  };

  return {
    tiers,
    selections,
    selectionRevisions,
    tierPutBodies,
    userPutBodies,
    conflictTierSave(tier) {
      conflictNextTierSave = tier;
    },
    conflictPersonalSave() {
      conflictNextPersonalSave = true;
    },
    delayPersonalSave() {
      let markStarted;
      let release;
      const started = new Promise((resolve) => {
        markStarted = resolve;
      });
      const released = new Promise((resolve) => {
        release = resolve;
      });
      delayedPersonalSave = { markStarted, released };
      return { started, release };
    },
    switchAccountOnProfileUpdate(accountId) {
      nextProfileAccountId = accountId;
    },
    failPersonalRead() {
      failNextPersonalRead = true;
    },
    async route(route, account) {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path === "/api/user/profile") {
        if (request.method() === "PUT" && nextProfileAccountId) {
          const body = request.postDataJSON();
          account.user_id = nextProfileAccountId;
          account.username = body.username;
          nextProfileAccountId = null;
        }
        return json(route, {
          ...account,
          email: `${account.role}@example.test`,
          has_graph_api_token: true,
          has_jira_api_token: true,
          can_use_task_agent: account.role !== "user",
          can_use_code_analyzer: account.role !== "user",
          access_token: "e30.eyJleHAiOjQxMDI0NDQ4MDB9.sig",
        });
      }
      if (path === "/api/admin/users") return json(route, { users: [] });
      if (path === "/api/admin/registration-settings") {
        return json(route, { require_invitation_code: true });
      }
      if (path === "/api/admin/invitation-codes") {
        return json(route, { codes: [] });
      }
      if (path === "/api/admin/tool-permissions") {
        return json(route, { catalog, tiers });
      }
      const tierMatch = path.match(
        /^\/api\/admin\/tool-permissions\/(user|developer|admin)$/
      );
      if (tierMatch) {
        const tier = tierMatch[1];
        const body = request.postDataJSON();
        tierPutBodies.push({ tier, body });
        if (conflictNextTierSave === tier) {
          conflictNextTierSave = null;
          tiers[tier] = {
            ...tiers[tier],
            revision: tiers[tier].revision + 1,
          };
          return json(
            route,
            {
              detail: {
                code: "tool_permissions_conflict",
                message: "Tier policy changed",
              },
            },
            409
          );
        }
        if (body.expected_revision !== tiers[tier].revision) {
          return json(
            route,
            {
              detail: {
                code: "tool_permissions_conflict",
                message: "Tier policy changed",
              },
            },
            409
          );
        }
        tiers[tier] = {
          tier,
          allowed_tool_ids: [...new Set(body.allowed_tool_ids)].sort(),
          revision: tiers[tier].revision + 1,
        };
        return json(route, tiers[tier]);
      }
      if (path === "/api/user/tool-permissions") {
        if (request.method() === "GET") {
          if (failNextPersonalRead) {
            failNextPersonalRead = false;
            return json(route, { detail: "Fixture storage unavailable" }, 503);
          }
          return json(route, userResponse(account));
        }
        const body = request.postDataJSON();
        const requestAccount = { ...account };
        userPutBodies.push({ account: requestAccount.user_id, body });
        if (delayedPersonalSave) {
          const delayed = delayedPersonalSave;
          delayedPersonalSave = null;
          delayed.markStarted();
          await delayed.released;
        }
        if (conflictNextPersonalSave) {
          conflictNextPersonalSave = false;
          tiers[requestAccount.role] = {
            ...tiers[requestAccount.role],
            allowed_tool_ids: tiers[
              requestAccount.role
            ].allowed_tool_ids.filter((id) => id !== "save_scope_note"),
            revision: tiers[requestAccount.role].revision + 1,
          };
          return json(
            route,
            {
              detail: {
                code: "tool_permissions_conflict",
                message: "Your administrator changed your tool permissions.",
              },
            },
            409
          );
        }
        const current = userResponse(requestAccount);
        if (
          body.expected_selection_revision !== current.selection_revision ||
          body.expected_tier_revision !== current.tier_revision
        ) {
          return json(
            route,
            {
              detail: {
                code: "tool_permissions_conflict",
                message: "Your tool selection changed.",
              },
            },
            409
          );
        }
        selections.set(
          requestAccount.user_id,
          [...new Set(body.selected_tool_ids)].sort()
        );
        selectionRevisions.set(
          requestAccount.user_id,
          current.selection_revision + 1
        );
        return json(route, userResponse(requestAccount));
      }
      if (path.endsWith("/assistants/search")) {
        return json(route, [
          {
            assistant_id: "assistant-1",
            graph_id: "mock-graph",
            created_at: "2026-09-11T12:00:00Z",
            updated_at: "2026-09-11T12:00:00Z",
            config: {},
            metadata: { created_by: "system" },
            version: 1,
            name: "Fixture assistant",
            context: {},
          },
        ]);
      }
      if (path === "/api/user/notifications") return json(route, []);
      if (path.startsWith("/api/")) return json(route, {});
      if (
        request.resourceType() === "fetch" ||
        request.resourceType() === "xhr"
      ) {
        return json(route, {});
      }
      return route.abort();
    },
  };
}

async function authenticatedPage(browser, fixture, policy, role) {
  const account = {
    user_id: `${role}-account`,
    username: `${role}-fixture`,
    role,
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const seenRequests = [];
  await page.addInitScript(
    ({ fixtureRole, accountId }) => {
      const payload = btoa(JSON.stringify({ exp: 4102444800 }))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      localStorage.setItem(
        "deep-agent-auth",
        JSON.stringify({
          user_id: accountId,
          username: `${fixtureRole}-fixture`,
          role: fixtureRole,
          email: `${fixtureRole}@example.test`,
          access_token: `e30.${payload}.sig`,
        })
      );
      localStorage.setItem(
        "deep-agent-config",
        JSON.stringify({ assistantId: "mock-graph" })
      );
      localStorage.setItem("vsda_workspace_tab", "tools");
      localStorage.setItem(`vsda_token_setup_dismissed_${accountId}`, "1");
    },
    { fixtureRole: role, accountId: account.user_id }
  );
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["fetch", "xhr"].includes(route.request().resourceType())) {
      seenRequests.push(`${route.request().method()} ${url.pathname}`);
    }
    if (isStaticExportRequest(route.request(), fixture.origin))
      return route.continue();
    return policy.route(route, account);
  });
  await page.goto(fixture.baseUrl, { waitUntil: "domcontentloaded" });
  const setupDialog = page.getByRole("dialog");
  if (await setupDialog.isVisible().catch(() => false)) {
    await setupDialog.getByRole("button", { name: "Set up later" }).click();
  }
  try {
    await page
      .getByRole("button", { name: "Workspace" })
      .waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(
      `Authenticated shell did not render: ${JSON.stringify({
        url: page.url(),
        body: (await page.locator("body").innerText()).slice(0, 1_200),
        pageErrors,
        consoleErrors,
        seenRequests,
      })}`
    );
  }
  return { context, page, pageErrors, consoleErrors };
}
