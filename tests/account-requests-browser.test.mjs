import assert from "node:assert/strict";
import test from "node:test";
import { compileBrowserStyles, loadPlaywright } from "./browser-fixtures.mjs";

test(
  "users submit and withdraw requests and admins apply the current review",
  { skip: process.env.ACCOUNT_REQUESTS_BROWSER_TEST !== "1", timeout: 60_000 },
  async () => {
    const { build } = await import("esbuild");
    const root = new URL("../", import.meta.url).pathname;
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
          import React from "react";
          import { mutate } from "swr";
          window.refreshRequest = (id) => mutate(["admin-account-request", "admin", id]);
          import { createRoot } from "react-dom/client";
          import { AuthProvider } from "./src/providers/AuthProvider";
          import { RequestActions } from "./src/app/components/account-requests/RequestActions";
          import { AdminRequestInbox } from "./src/app/components/account-requests/AdminRequestInbox";
          createRoot(document.getElementById("root")).render(
            <AuthProvider><main className="p-4">
              {location.pathname === "/admin-view" ? <AdminRequestInbox onFulfilled={() => document.body.dataset.fulfilled = "yes"} /> : <RequestActions location="account" />}
            </main></AuthProvider>
          );
        `,
      },
      bundle: true,
      format: "esm",
      write: false,
    });
    const { css } = await compileBrowserStyles({ omitFontFaces: true });
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch();
    const errors = [];
    const origin = "http://localhost:39490";
    let rows = [];
    const date = "2026-11-23T15:00:00Z";
    const requests = [];
    async function open(role, width, dark = false) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(
        ({ role }) => {
          localStorage.setItem(
            "deep-agent-auth",
            JSON.stringify({
              role,
              username: role,
              user_id: role,
              access_token: "e30.eyJleHAiOjQxMDI0NDQ4MDB9.sig",
            })
          );
        },
        { role }
      );
      await page.route(`${origin}/**`, async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (!path.startsWith("/api/")) {
          return route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><html class="${dark ? "dark" : ""}"><body><div id="root"></div></body></html>`,
          });
        }
        if (path.endsWith("/profile")) {
          return route.fulfill({
            json: { role, username: role, user_id: role },
          });
        }
        if (path.endsWith("/account-request-options")) {
          const pending = rows.find((row) => row.status === "pending");
          return route.fulfill({
            json: {
              items: [
                {
                  type: "developer_access",
                  developer_capabilities: ["Access repository analysis"],
                  available: !pending,
                  disabled_reason: null,
                  pending_request_id: pending?.id ?? null,
                  current_limit: null,
                  cycle_end: null,
                },
              ],
            },
          });
        }
        const id = path.split("/").at(-1);
        const row = rows.find((item) => item.id === id);
        if (req.method() !== "GET") {
          const payload = req.postDataJSON();
          requests.push({ id, payload, key: req.headers()["idempotency-key"] });
          if (req.method() === "POST") {
            const created = {
              id: `request-${rows.length + 1}`,
              type: payload.type,
              status: "pending",
              reason: payload.reason,
              requested_limit: null,
              created_at: date,
              updated_at: date,
              decided_at: null,
              decision_reason: null,
              result: null,
              username: "user",
              role: "user",
              account_id: "user",
              decision_actor_id: null,
            };
            rows = [created, ...rows];
            return route.fulfill({ status: 201, json: created });
          }
          row.status =
            payload.action === "withdraw" ? "withdrawn" : "fulfilled";
          return route.fulfill({ json: row });
        }
        if (row) {
          return route.fulfill({
            json: path.startsWith("/api/admin/")
              ? {
                  ...row,
                  review_version: row.review_version ?? "review-1",
                  review: {
                    developer_capabilities: ["Access repository analysis"],
                  },
                }
              : row,
          });
        }
        return route.fulfill({
          json: {
            items: path.startsWith("/api/admin/")
              ? rows.filter((item) => item.status === "pending")
              : rows,
            next_cursor: null,
          },
        });
      });
      await page.goto(
        `${origin}/${role === "admin" ? "admin-view" : "account-view"}`
      );
      await page.addStyleTag({ content: css });
      await page.addScriptTag({
        content: bundle.outputFiles[0].text,
        type: "module",
      });
      return page;
    }
    try {
      const user = await open("user", 320);
      const action = user.getByRole("button", {
        name: "Request developer access",
      });
      await action.focus();
      await user.keyboard.press("Enter");
      await user.getByText("Access repository analysis").waitFor();
      await user
        .getByLabel("Reason", { exact: true })
        .fill("Review embedded software");
      await user.getByRole("button", { name: "Submit request" }).click();
      await user.getByText("Request sent to the admins.").waitFor();
      await user.getByRole("button", { name: "Withdraw" }).click();
      await user.getByText("Withdrawn", { exact: true }).waitFor();
      await user.keyboard.press("Escape");
      await user.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        await action.evaluate((element) => element === document.activeElement),
        true
      );
      await action.click();
      await user.getByLabel("Reason", { exact: true }).fill("Review firmware");
      await user.getByRole("button", { name: "Submit request" }).click();
      await user.getByText("Review firmware", { exact: true }).waitFor();
      assert.equal(
        await user.evaluate(() => document.documentElement.scrollWidth),
        320
      );

      const admin = await open("admin", 1440, true);
      await admin
        .getByRole("button", { name: "Review Developer access for user" })
        .click();
      await admin.getByText("Access repository analysis").waitFor();
      await admin.getByRole("button", { name: "Approve and apply" }).click();
      await admin.getByText("Request completed.").waitFor();
      await admin.getByText("No pending requests.").waitFor();
      assert.equal(
        await admin.locator("body").getAttribute("data-fulfilled"),
        "yes"
      );
      assert.deepEqual(requests.at(-1).payload, {
        action: "approve",
        review_version: "review-1",
      });
      assert.ok(requests.every(({ key }) => key));
      assert.equal(
        new Set(requests.map(({ key }) => key)).size,
        requests.length
      );
      const deletion = {
        ...rows[0],
        id: "deletion",
        type: "account_deletion",
        status: "pending",
      };
      rows = [deletion];
      const reviewer = await open("admin", 1440);
      await reviewer
        .getByRole("button", { name: "Review Account deletion for user" })
        .click();
      const confirmation = reviewer.getByRole("checkbox");
      await confirmation.check();
      deletion.username = "renamed";
      deletion.review_version = "review-2";
      await reviewer.evaluate(() => window.refreshRequest("deletion"));
      await reviewer.getByText("renamed", { exact: true }).waitFor();
      assert.equal(await confirmation.isChecked(), false);
      assert.equal(
        await reviewer
          .getByRole("button", { name: "Delete account" })
          .isDisabled(),
        true
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
);
