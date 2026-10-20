import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "all source and tier controls persist independent grants, recover failures, and fit mobile",
  { skip: process.env.SOURCE_ATTACHMENT_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.SOURCE_IMAGE_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { SourceImageControls } from "./src/app/components/admin/SourceImageControls";
          import { Toaster } from "sonner";
          createRoot(document.getElementById("root")).render(
            <><main className="mx-auto max-w-xl space-y-6 p-4">
              <h1 className="text-lg font-semibold">Source attachment permissions</h1>
              {["user", "developer", "admin"].map(tier => (
                <section key={tier} aria-label={tier + " tier"}>
                  <h2 className="mb-2 text-sm font-semibold capitalize">{tier}</h2>
                  <SourceImageControls tier={tier} />
                </section>
              ))}
            </main><Toaster /></>
          );
        `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const cssDir = join(ROOT, "out", "_next", "static", "chunks");
    const css = (
      await Promise.all(
        (await readdir(cssDir))
          .filter((name) => name.endsWith(".css"))
          .map((name) => readFile(join(cssDir, name), "utf8"))
      )
    ).join("\n");
    const policies = new Map();
    const writes = [];
    let failSave = false;
    let failRead = true;
    const server = createServer(async (request, response) => {
      if (request.url.startsWith("/api/admin/tier-source-images/")) {
        response.setHeader("Content-Type", "application/json");
        const [, tier, source] = request.url.match(
          /tier-source-images\/([^/]+)\/([^/]+)/
        );
        const key = `${tier}/${source}`;
        if (request.method === "GET" && failRead && key === "user/jira") {
          failRead = false;
          response.statusCode = 503;
          return response.end(
            JSON.stringify({ detail: "Policy temporarily unavailable" })
          );
        }
        if (request.method === "PUT") {
          let payload = "";
          for await (const chunk of request) payload += chunk;
          const body = JSON.parse(payload);
          writes.push({ tier, source, body });
          if (failSave) {
            failSave = false;
            response.statusCode = 503;
            return response.end(
              JSON.stringify({ detail: "Save failed; try again" })
            );
          }
          policies.set(key, body);
        }
        return response.end(
          JSON.stringify({
            tier,
            source,
            enabled: false,
            documents_enabled: false,
            default_scope: "embedded",
            allow_all: false,
            ...policies.get(key),
          })
        );
      }
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "text/javascript");
        return response.end(bundle.outputFiles[0].text);
      }
      if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        return response.end(css);
      }
      if (request.url.startsWith("/fonts/")) {
        try {
          return response.end(
            await readFile(join(ROOT, "public", request.url))
          );
        } catch {
          response.statusCode = 404;
          return response.end();
        }
      }
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.SOURCE_IMAGE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.SOURCE_IMAGE_BROWSER_EXECUTABLE }
        : {}),
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 1000 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page
        .getByRole("alert")
        .filter({ hasText: "Policy temporarily unavailable" })
        .waitFor();
      await page.getByRole("button", { name: "Retry" }).click();
      const sources = [
        ["jira", "Jira"],
        ["polarion", "Polarion"],
        ["confluence", "Confluence"],
        ["graph", "Microsoft Graph"],
      ];
      const settled = async (control) => {
        await page.waitForFunction(
          (element) => element?.getAttribute("aria-busy") === "false",
          await control
            .locator("xpath=ancestor::div[@aria-busy]")
            .elementHandle()
        );
      };
      for (const tier of ["user", "developer", "admin"]) {
        for (const [source, label] of sources) {
          const documents = page.getByRole("switch", {
            name: `${label} documents for ${tier} tier`,
            exact: true,
          });
          const images = page.getByRole("switch", {
            name: `${label} images for ${tier} tier`,
            exact: true,
          });
          const scope = page.getByRole("combobox", {
            name: `Default ${label} attachment fetch for ${tier} tier`,
            exact: true,
          });
          await documents.waitFor();
          assert.equal(await scope.isDisabled(), true);
          await documents.focus();
          await page.keyboard.press("Space");
          await settled(documents);
          assert.equal(await documents.getAttribute("aria-checked"), "true");
          assert.equal(await images.getAttribute("aria-checked"), "false");
          assert.equal(await scope.isEnabled(), true);
          assert.deepEqual(writes.at(-1), {
            tier,
            source,
            body: {
              enabled: false,
              documents_enabled: true,
              default_scope: "embedded",
              allow_all: false,
            },
          });
        }
      }
      const docs = page.getByRole("switch", {
        name: "Microsoft Graph documents for user tier",
        exact: true,
      });
      const images = page.getByRole("switch", {
        name: "Microsoft Graph images for user tier",
        exact: true,
      });
      const scope = page.getByRole("combobox", {
        name: "Default Microsoft Graph attachment fetch for user tier",
        exact: true,
      });
      const allowAll = page.getByRole("switch", {
        name: "Allow all Microsoft Graph attachments for user tier",
        exact: true,
      });
      await images.click();
      await settled(images);
      assert.equal(writes.at(-1).body.documents_enabled, true);
      await scope.click();
      await page
        .getByRole("option", { name: "All attachments", exact: true })
        .click();
      await settled(scope);
      assert.equal(await allowAll.getAttribute("aria-checked"), "true");
      await allowAll.click();
      await settled(allowAll);
      assert.equal(await scope.innerText(), "Embedded only");
      failSave = true;
      await docs.click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Save failed; try again" })
        .waitFor();
      assert.equal(await docs.getAttribute("aria-checked"), "true");
      assert.equal(await images.getAttribute("aria-checked"), "true");
      await page.reload();
      await docs.waitFor();
      assert.equal(await docs.getAttribute("aria-checked"), "true");
      assert.equal(await images.getAttribute("aria-checked"), "true");
      const evidence = process.env.SOURCE_ATTACHMENT_EVIDENCE;
      if (evidence) await mkdir(evidence, { recursive: true });
      const section = page.getByRole("region", {
        name: "user tier",
        exact: true,
      });
      for (const width of [1000, 375, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await section.scrollIntoViewIfNeeded();
        const bounds = await section.evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        assert(bounds.scroll <= bounds.width + 1, `Overflow at ${width}px`);
        if (evidence)
          await section.screenshot({
            path: join(evidence, `source-permissions-${width}.png`),
          });
      }
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      if (evidence)
        await section.screenshot({
          path: join(evidence, "source-permissions-dark.png"),
        });
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
