import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "admin endpoint and token overrides save, reset, reload and fit mobile",
  { skip: process.env.ADMIN_CONNECTIVITY_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.ADMIN_CONNECTIVITY_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { default: loadConfig } = await import("tailwindcss/loadConfig.js");
    const config = loadConfig(join(ROOT, "tailwind.config.mjs"));
    const css = await postcss([tailwind(config)]).process(
      await readFile(join(ROOT, "src/app/globals.css"), "utf8"),
      { from: join(ROOT, "src/app/globals.css") }
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { UrlOverridesSection } from "./src/app/components/admin/ConnectivitySettingsSections";
          import { RunModeSection } from "./src/app/components/admin/RunModeSection";
          import { ConnectivitySidebar } from "./src/app/components/ConnectivitySidebar";
          import { Toaster } from "sonner";
          createRoot(document.getElementById("root")).render(
            <><main className="mx-auto max-w-4xl space-y-6 p-4">
              <h1 className="text-lg font-semibold">Connectivity</h1>
              {location.search.includes("user=1") ?
                <div className="relative h-screen"><ConnectivitySidebar /></div> :
                <><RunModeSection /><UrlOverridesSection /></>}
            </main><Toaster /></>
          );
        `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      plugins: [
        {
          name: "isolated-connectivity-context",
          setup(build) {
            build.onLoad({ filter: /[\\/]ConnectivityProvider\.tsx$/ }, () => ({
              contents:
                "const setRunModeLocal = () => {}; export const useConnectivity = () => ({setRunModeLocal});",
              loader: "ts",
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const urls = {};
    const tokens = {
      cf_aig_token: { configured: true, overridden: true, updated_at: null },
    };
    for (const prefix of ["openai", "claude", "google", "xai"]) {
      for (const mode of ["remote", "gateway", "proxy"]) {
        urls[`${prefix}_base_url${mode === "remote" ? "" : `_${mode}`}`] = {
          value: `https://${prefix}-${mode}.example/v1`,
          source: "env",
          updated_at: null,
          updated_by: null,
        };
        if (mode !== "proxy") {
          tokens[`${prefix}_api_key_${mode}`] = {
            configured: true,
            overridden: false,
            updated_at: null,
          };
        }
      }
    }
    const writes = [];
    let failSave = false;
    let failLoad = false;
    let runMode = "gateway";
    let userMode = "gateway";
    const server = createServer(async (request, response) => {
      if (request.url === "/api/admin/run-mode") {
        if (request.method === "PUT") {
          let payload = "";
          for await (const chunk of request) payload += chunk;
          runMode = JSON.parse(payload).run_mode;
        }
        response.setHeader("Content-Type", "application/json");
        return response.end(
          JSON.stringify({
            run_mode: runMode,
            run_mode_updated_at: "Unknown",
            run_mode_time_gap: "",
          })
        );
      }
      if (request.url === "/api/user/connectivity") {
        if (request.method === "PUT") {
          let payload = "";
          for await (const chunk of request) payload += chunk;
          userMode = JSON.parse(payload).run_mode ?? "gateway";
        }
        response.setHeader("Content-Type", "application/json");
        return response.end(
          JSON.stringify({
            run_mode: userMode,
            default_run_mode: "gateway",
            run_mode_source: "admin",
            proxy_url: "",
            proxy_url_source: "env",
          })
        );
      }
      if (request.url === "/api/user/image-fetching") {
        response.setHeader("Content-Type", "application/json");
        return response.end(
          JSON.stringify({ enabled: false, effective: false, sources: {} })
        );
      }
      if (request.url === "/api/admin/connectivity") {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET" && failLoad) {
          failLoad = false;
          response.statusCode = 503;
          return response.end(JSON.stringify({ detail: "Unavailable" }));
        }
        if (request.method === "PUT") {
          let payload = "";
          for await (const chunk of request) payload += chunk;
          const body = JSON.parse(payload);
          writes.push(body);
          if (failSave) {
            failSave = false;
            response.statusCode = 503;
            return response.end(
              JSON.stringify({ detail: "Save failed; retry" })
            );
          }
          for (const [key, value] of Object.entries(body)) {
            if (key in urls) {
              urls[key] = { ...urls[key], value, source: "database" };
            } else {
              tokens[key] = {
                configured: true,
                overridden: Boolean(value),
                updated_at: null,
              };
            }
          }
        }
        return response.end(
          JSON.stringify({
            run_mode: "gateway",
            run_mode_source: "env",
            urls,
            tokens,
          })
        );
      }
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "text/javascript");
        return response.end(bundle.outputFiles[0].text);
      }
      if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        return response.end(css.css);
      }
      response.setHeader("Content-Type", "text/html");
      response.end(
        `<html lang="en" class="${
          request.url.includes("dark=1") ? "dark" : ""
        }"><head><title>Connectivity settings</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.ADMIN_CONNECTIVITY_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ADMIN_CONNECTIVITY_BROWSER_EXECUTABLE }
        : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 900 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const checkAccessibility = async () => {
        await page.addScriptTag({
          path: join(ROOT, "node_modules/axe-core/axe.min.js"),
        });
        const violations = await page.evaluate(async () =>
          (
            await axe.run(document.querySelector("main"), {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations.map(({ id, nodes }) => ({
            id,
            nodes: nodes.map((node) => node.target),
          }))
        );
        assert.deepEqual(violations, []);
      };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const modes = page.getByRole("radiogroup", {
        name: "Modes",
        exact: true,
      });
      await modes
        .getByRole("radio", { name: "gateway", exact: true })
        .waitFor();
      await modes.getByRole("radio", { name: "gateway", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await modes
          .getByRole("radio", { name: "proxy", exact: true })
          .getAttribute("aria-checked"),
        "true"
      );
      await page.keyboard.press("Home");
      assert.equal(
        await modes
          .getByRole("radio", { name: "remote", exact: true })
          .getAttribute("aria-checked"),
        "true"
      );
      await page
        .getByRole("button", { name: "Save run mode", exact: true })
        .click();
      await page.getByRole("button", { name: "Saved", exact: true }).waitFor();
      assert.equal(runMode, "remote");
      await page.locator("summary").click();
      const save = page.getByRole("button", {
        name: "Save connectivity overrides",
      });
      await save.waitFor();
      assert.equal(await save.isDisabled(), true);
      assert.equal(await page.locator('input[type="password"]').count(), 9);
      assert.equal(await page.locator('input[type="url"]').count(), 12);
      const url = page.getByRole("textbox", {
        name: "OpenAI gateway base URL",
      });
      const token = page.getByLabel("OpenAI gateway token (optional)", {
        exact: true,
      });
      assert.equal(await token.getAttribute("type"), "password");
      await url.fill("https://custom.example/scoped/v1");
      await token.fill("test-gateway-secret");
      await save.click();
      await page
        .getByText("Connectivity overrides saved", { exact: true })
        .waitFor();
      await page.waitForFunction(
        () =>
          document.querySelector("#runtime-openai_api_key_gateway").value === ""
      );
      assert.deepEqual(writes.at(-1), {
        openai_base_url_gateway: "https://custom.example/scoped/v1",
        openai_api_key_gateway: "test-gateway-secret",
      });
      assert.equal(await save.isDisabled(), true);

      await page.reload();
      await page.locator("summary").click();
      await token.waitFor();
      assert.equal(await token.inputValue(), "");
      assert.equal(await url.inputValue(), "https://custom.example/scoped/v1");
      await page
        .getByRole("button", {
          name: "Reset OpenAI gateway token (optional)",
          exact: true,
        })
        .click();
      await save.click();
      await page.waitForFunction(() =>
        document
          .querySelector("#runtime-openai_api_key_gateway")
          .closest("[data-connectivity-token]")
          .textContent.includes("Using environment token")
      );
      assert.deepEqual(writes.at(-1), { openai_api_key_gateway: "" });

      // A failed save preserves the draft so retry sends the same replacement.
      failSave = true;
      await token.fill("retry-secret");
      await save.click();
      await page.getByText("Save failed; retry", { exact: true }).waitFor();
      assert.equal(await token.inputValue(), "retry-secret");
      await save.click();
      await page.waitForFunction(
        () =>
          document.querySelector("#runtime-openai_api_key_gateway").value === ""
      );
      assert.equal(writes.at(-1).openai_api_key_gateway, "retry-secret");

      const evidence = process.env.ADMIN_CONNECTIVITY_EVIDENCE;
      if (evidence) await mkdir(evidence, { recursive: true });
      await page
        .locator("[data-sonner-toast]")
        .last()
        .waitFor({ state: "hidden" });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const fieldHeight = await page.evaluate(
          () =>
            parseFloat(getComputedStyle(document.documentElement).fontSize) *
            2.5
        );
        const bounds = await page.locator("main").evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        assert(bounds.scroll <= bounds.width + 1, `Overflow at ${width}px`);
        const alignment = await page
          .locator("[data-connectivity-mode]")
          .evaluateAll((rows) =>
            rows.map((row) => {
              const input = row
                .querySelector('input[type="url"]')
                .getBoundingClientRect();
              const authentication =
                row.querySelector('input[type="password"]') ??
                row.querySelector(".border-dashed");
              const other = authentication.getBoundingClientRect();
              return {
                mode: row.dataset.connectivityMode,
                inputTop: input.top,
                otherTop: other.top,
                inputHeight: input.height,
                otherHeight: other.height,
                sameColumn: Math.abs(input.left - other.left) < 1,
              };
            })
          );
        for (const row of alignment) {
          assert.equal(row.inputHeight, fieldHeight);
          assert.equal(row.otherHeight, fieldHeight);
          if (!row.sameColumn)
            assert(
              Math.abs(row.inputTop - row.otherTop) <= 1,
              `Misaligned fields at ${width}px: ${JSON.stringify(row)}`
            );
        }
        if (evidence) {
          await page.locator("main").screenshot({
            path: join(evidence, `admin-connectivity-${width}.png`),
          });
        }
      }
      await checkAccessibility();

      failLoad = true;
      await page.reload();
      await page.locator("summary").click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Failed to load connectivity settings" })
        .waitFor();
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await token.waitFor();
      assert.equal(await page.getByRole("alert").count(), 0);
      await page.goto(`http://127.0.0.1:${server.address().port}/?dark=1`);
      await page.locator("summary").click();
      await token.waitFor();
      await checkAccessibility();
      if (evidence) {
        await page
          .locator("main")
          .screenshot({ path: join(evidence, "admin-connectivity-dark.png") });
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/?user=1`);
      const userModes = page.getByRole("radiogroup", {
        name: "Run mode",
        exact: true,
      });
      await userModes
        .getByRole("radio", { name: "gateway", exact: true })
        .waitFor();
      await userModes
        .getByRole("radio", { name: "gateway", exact: true })
        .focus();
      await page.keyboard.press("End");
      await page.getByLabel("Proxy base URL", { exact: true }).waitFor();
      assert.equal(
        await userModes
          .getByRole("radio", { name: "proxy", exact: true })
          .getAttribute("aria-checked"),
        "true"
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await userModes.evaluate(
          (element) => element.scrollWidth > element.clientWidth
        );
        assert.equal(overflow, false, `User selector overflow at ${width}px`);
        if (width === 320) await checkAccessibility();
        if (evidence)
          await page.locator("main").screenshot({
            path: join(evidence, `user-connectivity-${width}.png`),
          });
      }
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?user=1&dark=1`
      );
      await page
        .getByRole("radiogroup", { name: "Run mode", exact: true })
        .waitFor();
      await checkAccessibility();
      if (evidence)
        await page.locator("main").screenshot({
          path: join(evidence, "user-connectivity-dark.png"),
        });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
