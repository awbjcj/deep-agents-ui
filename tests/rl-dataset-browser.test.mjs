import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { loadPlaywright } from "./browser-fixtures.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";
import {
  authenticatedPage,
  json,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";

const API = "/api/admin/rl-dataset";
const FIRST_ID = "a31c709b-74cb-46cf-88b2-e41c07835303";
const SECOND_ID = "b184026f-a237-4f3d-b135-36cc6afb817e";
const CURSOR = "opaque+cursor//=";
const HARN_HASH = "a".repeat(64);
const WHEN = "2026-11-20T16:00:00Z";
const REASON = {
  id: "precise_jql",
  label: "Precise JQL",
  description: "A query accurately scoped the project.",
  category: "domain",
  polarity: "positive",
  domains: ["jira"],
  tool_groups: ["jira"],
};
const OWNER_FIELDS =
  /user_id|username|email|display_name|displayName|job_title|thread_id|owner-secret|private-name|admin-fixture/i;

function sessionSummary(session_id, curation_status = "unreviewed") {
  return {
    session_id,
    graph_id: "VSDA Deep Agent",
    variant: null,
    approval_mode: "approval_required",
    curation_status,
    capture_status: "partial",
    message_count: 2,
    tool_call_count: 1,
    subagent_count: 1,
    rating_count: 2,
    avg_score: 4.5,
    min_score: 4,
    max_score: 5,
    models: ["sample-model"],
    tags: [REASON.id],
    first_rated_at: WHEN,
    last_rated_at: WHEN,
    snapshot_updated_at: WHEN,
  };
}

function detail(summary) {
  return {
    ...summary,
    schema_version: 1,
    root_harness_hash: HARN_HASH,
    capture_warnings: ["One archived turn could not be recovered."],
    harness_configs: {
      [HARN_HASH]: {
        graph_id: summary.graph_id,
        agent_name: "Supervisor",
        app_version: "1.0.0",
        sanitized_system_prompt: "Use project-scoped tools.",
        tool_schemas: [{ name: "search_jira", parameters: { type: "object" } }],
        system_skills: ["search-jira"],
      },
    },
    trajectory: {
      compaction_events: [{ outcome: "Recovered history" }],
      rubric_evaluations: [{ score: 5 }],
      task_outcome: "success",
      steps: [
        {
          step_index: 0,
          role: "user",
          content: "Find [PERSON_1]'s open work.",
        },
        {
          step_index: 1,
          role: "assistant",
          content: "VSDA-1234 is open.",
          model_meta: { provider: "openai", model: "sample-model" },
          tool_calls: [
            {
              tool_call_id: "anonymous-tool-key",
              name: "search_jira",
              args: {
                jql: "project = VSDA",
                requester: { email: "owner-secret@example.test" },
              },
              result: "Ticket VSDA-1234",
              status: "ok",
              truncated: true,
              original_bytes: 131073,
              approval_decision: "approve",
            },
          ],
          subagent_runs: [
            {
              tool_call_id: "anonymous-tool-key",
              subagent_name: "jira",
              subagent_step_index: 0,
              status: "completed",
              task_input: "Search the project.",
              final_output: "Found the issue.",
              steps: [
                {
                  step_index: 0,
                  role: "assistant",
                  content: "Narrowed the JQL query.",
                },
              ],
              model_meta: { model: "sample-model" },
            },
          ],
        },
      ],
    },
    ratings: ["agent_message", "subagent_run"].map((target_type, index) => ({
      id: `anonymous-rating-${index}`,
      target_type,
      score: 5 - index,
      step_index: 1,
      subagent_step_index: index === 1 ? 0 : null,
      subagent_name: index === 1 ? "jira" : null,
      tags: [REASON.id],
      tag_metadata: [REASON],
      model_name: "sample-model",
      created_at: WHEN,
      updated_at: WHEN,
    })),
  };
}

function datasetFixture() {
  const app = settingsReviewFixture();
  const calls = [];
  const sessions = [
    sessionSummary(FIRST_ID),
    sessionSummary(SECOND_ID, "excluded"),
  ];
  let enabled = true;
  let source = "env";
  return {
    calls,
    async route(route, account) {
      const request = route.request();
      const { pathname, searchParams } = new URL(request.url());
      if (!pathname.startsWith(`${API}/`)) return app.route(route, account);
      const method = request.method();
      const payload = request.postDataJSON();
      const query = Object.fromEntries(searchParams);
      calls.push({
        method,
        pathname,
        payload,
        query,
        authorization: request.headers().authorization,
      });
      if (pathname === `${API}/settings`) {
        if (method === "PUT") {
          enabled = payload.enabled;
          source = "database";
        }
        return json(route, { enabled, source });
      }
      if (pathname === `${API}/stats`) {
        return json(route, {
          total_sessions: sessions.length,
          total_ratings: 2 * sessions.length,
          star_histogram: {
            1: 0,
            2: 0,
            3: 0,
            4: sessions.length,
            5: sessions.length,
          },
          curation_counts: Object.fromEntries(
            ["unreviewed", "approved", "excluded"].map((status) => [
              status,
              sessions.filter((row) => row.curation_status === status).length,
            ])
          ),
          target_type_counts: {
            agent_message: sessions.length,
            subagent_run: sessions.length,
          },
          top_tags: [{ ...REASON, count: 2 * sessions.length }],
          graphs: { "VSDA Deep Agent": sessions.length },
          models: { "sample-model": sessions.length },
          compressed_bytes: 250,
          uncompressed_bytes: 500,
        });
      }
      if (pathname === `${API}/sessions`) {
        const rows = sessions.filter(
          (row) =>
            (!query.curation_status ||
              row.curation_status === query.curation_status) &&
            (!query.domain || row.session_id === FIRST_ID)
        );
        const offset = query.cursor === CURSOR ? 1 : 0;
        return json(route, {
          sessions: rows.slice(offset, offset + 1),
          next_cursor: rows.length > offset + 1 ? CURSOR : null,
        });
      }
      if (pathname === `${API}/purge`) {
        const purged = sessions.filter(
          (row) => row.curation_status === payload.curation_status
        );
        for (const row of purged) sessions.splice(sessions.indexOf(row), 1);
        return json(route, {
          deleted_sessions: purged.length,
          deleted_ratings: 2 * purged.length,
        });
      }
      if (pathname === `${API}/export`) {
        const allowed = sessions.filter((row) =>
          query.curation_status.split(",").includes(row.curation_status)
        );
        const lines = allowed.map(({ session_id, curation_status }) => ({
          session_id,
          curation_status,
          ...(query.format === "canonical_thread"
            ? { trajectory: { steps: [] } }
            : { score: 5, reward_normalized: 1 }),
        }));
        return route.fulfill({
          contentType: "application/x-ndjson",
          body: `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
        });
      }
      const id = pathname.split("/").at(-1);
      const row = sessions.find((session) => session.session_id === id);
      if (!row)
        return json(route, { detail: "Anonymous session missing" }, 404);
      if (method === "DELETE") {
        sessions.splice(sessions.indexOf(row), 1);
        return route.fulfill({ status: 204 });
      }
      if (method === "PATCH") {
        row.curation_status = payload.curation_status;
        return json(route, row);
      }
      // Unexpected owner fields are never rendered by the inspector.
      return json(route, {
        ...detail(row),
        thread_id: "owner-secret-thread",
        display_name: "private-name",
      });
    },
  };
}

test(
  "admin filters and curates anonymous trajectories, exports both JSONL formats, and purges explicit matches",
  { skip: process.env.RL_DATASET_BROWSER_TEST !== "1", timeout: 90_000 },
  async () => {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const policy = datasetFixture();
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        server,
        policy,
        "admin"
      );
      page.setDefaultTimeout(12_000);
      // Exercise the actual browser download path used when the native picker is unavailable.
      await page.evaluate(() =>
        Object.defineProperty(window, "showSaveFilePicker", {
          value: undefined,
          configurable: true,
        })
      );
      const evidence = process.env.RL_DATASET_EVIDENCE_DIR;
      if (evidence) await mkdir(evidence, { recursive: true });
      await page
        .getByRole("button", { name: "Admin console", exact: true })
        .click();
      assert.equal(
        policy.calls.length,
        0,
        "unopened tabs do not load the dataset"
      );
      const admin = page.locator("#admin-panel");
      await admin.getByRole("button", { name: "Expand admin panel" }).click();
      await admin.getByRole("tab", { name: "RL Dataset", exact: true }).click();
      const dataset = admin.getByRole("tabpanel");
      const inspect = (id) =>
        dataset.getByRole("button", {
          name: `Inspect session ${id.slice(0, 8)}`,
        });
      await inspect(FIRST_ID).waitFor();
      if (evidence)
        await page.screenshot({
          path: join(evidence, "dataset-desktop.png"),
          animations: "disabled",
        });
      await dataset.getByRole("button", { name: "Next", exact: true }).click();
      await inspect(SECOND_ID).waitFor();
      assert.ok(policy.calls.some((call) => call.query.cursor === CURSOR));
      const previous = dataset.getByRole("button", {
        name: "Previous",
        exact: true,
      });
      await previous.focus();
      await previous.press("Enter");
      await inspect(FIRST_ID).waitFor();
      assert.equal(await previous.getAttribute("aria-disabled"), "true");
      assert.equal(
        await previous.evaluate((button) => button === document.activeElement),
        true
      );

      const toggle = dataset.getByRole("switch", {
        name: /Collect response ratings/,
      });
      assert.equal(await toggle.getAttribute("aria-checked"), "true");
      await toggle.click();
      await dataset
        .getByText("Paused · Admin override", { exact: true })
        .waitFor();
      assert.deepEqual(
        policy.calls.find((call) => call.method === "PUT").payload,
        { enabled: false }
      );

      await dataset.getByText("Session filters", { exact: true }).click();
      const form = dataset.getByRole("form", { name: "Filter sessions" });
      await form.getByLabel("Target type").selectOption("agent_message");
      await form.getByLabel("Minimum stars").selectOption("4");
      await form.getByLabel("Maximum stars").selectOption("5");
      await form.getByLabel("Domain", { exact: true }).selectOption("jira");
      await form.getByLabel("Reason tag").fill(REASON.id);
      await form.getByLabel("Graph", { exact: true }).fill("VSDA Deep Agent");
      await form.getByLabel("Model", { exact: true }).fill("sample-model");
      await form.getByLabel("From date (UTC)").fill("2026-11-01");
      await form.getByLabel("To date (UTC)").fill("2026-11-27");
      await form.getByRole("button", { name: "Apply filters" }).click();
      await inspect(FIRST_ID).waitFor();
      const applied = {
        domain: "jira",
        tag: REASON.id,
        target_type: "agent_message",
        min_score: "4",
        max_score: "5",
        graph_id: "VSDA Deep Agent",
        model: "sample-model",
        date_from: "2026-11-01",
        date_to: "2026-11-27",
      };
      assert.deepEqual(
        policy.calls.findLast((call) => call.pathname === `${API}/sessions`)
          .query,
        { ...applied, limit: "20" }
      );
      assert.doesNotMatch(await dataset.innerText(), OWNER_FIELDS);

      await inspect(FIRST_ID).focus();
      await inspect(FIRST_ID).press("Enter");
      const inspector = page.getByRole("dialog", {
        name: "Anonymized trajectory",
      });
      await inspector
        .getByText("VSDA-1234 is open.", { exact: true })
        .waitFor();
      assert.equal(
        await inspector.evaluate(
          (element) => getComputedStyle(element).animationName
        ),
        "none"
      );
      if (evidence)
        await page.screenshot({
          path: join(evidence, "trajectory-inspector.png"),
          animations: "disabled",
          style: "[data-sonner-toaster] { visibility: hidden; }",
        });
      await page.keyboard.press("Escape");
      await inspector.waitFor({ state: "hidden" });
      assert.equal(
        await inspect(FIRST_ID).evaluate(
          (button) => button === document.activeElement
        ),
        true
      );
      await inspect(FIRST_ID).click();
      await inspector
        .getByText("One archived turn could not be recovered.")
        .waitFor();
      await inspector.getByText("search_jira", { exact: true }).click();
      await inspector.getByText("Arguments", { exact: true }).click();
      await inspector.getByText("Result", { exact: true }).click();
      await inspector.getByText("Ticket VSDA-1234", { exact: true }).waitFor();
      await inspector
        .getByText(/Result truncated at the capture limit/)
        .waitFor();
      await inspector
        .getByText("HITL approval decision", { exact: true })
        .click();
      await inspector.getByText("approve", { exact: true }).waitFor();
      await inspector.getByText("jira subagent", { exact: true }).click();
      await inspector
        .getByText("Narrowed the JQL query.", { exact: true })
        .waitFor();
      await inspector
        .getByText("Harness configurations (1)", { exact: true })
        .click();
      await inspector.getByText("Supervisor · Root", { exact: true }).click();
      await inspector.getByText("System prompt", { exact: true }).click();
      await inspector
        .getByText("Use project-scoped tools.", { exact: true })
        .waitFor();
      assert.doesNotMatch(await inspector.textContent(), OWNER_FIELDS);
      const approveButton = inspector.getByRole("button", {
        name: "Approve",
        exact: true,
      });
      await approveButton.click();
      await inspector.getByText("approved", { exact: true }).waitFor();
      assert.deepEqual(
        policy.calls.find((call) => call.method === "PATCH").payload,
        { curation_status: "approved" }
      );
      await page.keyboard.press("Escape");

      const formats = [
        [
          "Download canonical threads",
          "canonical_thread",
          "approved,unreviewed",
        ],
        ["Download RL samples", "rl_samples", "approved"],
      ];
      for (const [label, format, status] of formats) {
        if (status === "approved")
          await dataset
            .getByRole("checkbox", { name: "Approved only" })
            .check();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          dataset.getByRole("button", { name: label }).click(),
        ]);
        assert.equal(download.suggestedFilename(), `${format}.jsonl`);
        const downloaded = await readFile(await download.path(), "utf8");
        assert.doesNotMatch(downloaded, OWNER_FIELDS);
        assert.equal(JSON.parse(downloaded.trim()).session_id, FIRST_ID);
        const exportCall = policy.calls.findLast(
          (call) => call.pathname === `${API}/export`
        );
        assert.deepEqual(exportCall.query, {
          ...applied,
          format,
          curation_status: status,
        });
        assert.match(exportCall.authorization, /^Bearer /);
      }

      await page
        .getByRole("button", { name: "Switch to night mode", exact: true })
        .click();
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("dark")
      );
      await page.setViewportSize({ width: 375, height: 820 });
      await inspect(FIRST_ID).waitFor();
      const sessionList = dataset.getByRole("list", {
        name: "Anonymized sessions",
      });
      await sessionList.waitFor();
      assert.equal(
        await dataset
          .getByRole("table", { name: "Anonymized sessions" })
          .count(),
        0
      );
      assert.ok(
        await sessionList.evaluate(
          (list) => list.scrollWidth <= list.clientWidth
        )
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
      if (evidence)
        await sessionList.screenshot({
          path: join(evidence, "dataset-mobile.png"),
          animations: "disabled",
          style: "[data-sonner-toaster] { visibility: hidden; }",
        });
      await inspect(FIRST_ID).click();
      const deleteButton = inspector.getByRole("button", {
        name: "Delete",
        exact: true,
      });
      await deleteButton.waitFor();
      const beforeScroll = await deleteButton.boundingBox();
      await inspector
        .getByText("Harness configurations (1)", { exact: true })
        .scrollIntoViewIfNeeded();
      assert.deepEqual(await deleteButton.boundingBox(), beforeScroll);
      await deleteButton.click();
      const deletion = page.getByRole("dialog", {
        name: "Delete this session?",
      });
      const cancel = deletion.getByRole("button", { name: "Cancel" });
      assert.equal(
        await cancel.evaluate((button) => button === document.activeElement),
        true
      );
      await cancel.click();
      assert.ok(!policy.calls.some((call) => call.method === "DELETE"));
      await inspector
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await deletion.getByRole("button", { name: "Delete session" }).click();
      await inspector.waitFor({ state: "hidden" });
      assert.ok(
        policy.calls.some(
          (call) =>
            call.method === "DELETE" &&
            call.pathname === `${API}/sessions/${FIRST_ID}`
        )
      );

      await form.getByRole("button", { name: "Reset" }).click();
      await form
        .getByLabel("Curation status", { exact: true })
        .selectOption("excluded");
      await form.getByRole("button", { name: "Apply filters" }).click();
      await inspect(SECOND_ID).waitFor();
      assert.equal(
        await dataset
          .getByRole("button", { name: "Download canonical threads" })
          .isEnabled(),
        false
      );
      await dataset.getByRole("button", { name: "Purge sessions" }).click();
      const purge = page.getByRole("dialog", {
        name: "Purge dataset sessions",
      });
      const confirmPurge = purge.getByRole("button", {
        name: "Permanently purge",
      });
      assert.equal(await confirmPurge.isEnabled(), false);
      await purge.getByLabel("Last rated more than (days ago)").fill("5");
      await purge.getByLabel("Purge curation status").selectOption("excluded");
      await confirmPurge.click();
      await purge.waitFor({ state: "hidden" });
      assert.deepEqual(
        policy.calls.find((call) => call.pathname === `${API}/purge`).payload,
        { older_than_days: 5, curation_status: "excluded" }
      );
      await dataset
        .getByText("No sessions match the applied filters.")
        .waitFor();
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
