import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import test from "node:test";

// Run after `npm run build` to exercise the real Next router and nuqs adapter.
const OUT = resolve(import.meta.dirname, "../out");
const MIME = {
  ".html": "text/html",
  ".txt": "text/plain",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

test(
  "expired sessions reach sign-in from conversation URLs with or without an assistant",
  {
    skip: process.env.SESSION_EXPIRY_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    // Mirror the exported backend routes, including extensionless login pages
    // and the text payloads used by Next's client-side navigation.
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, "http://localhost").pathname.replace(
        /^\/chat\/?/,
        ""
      );
      let file = join(OUT, path || "index.html");
      try {
        if (!(await stat(file)).isFile()) throw new Error("not a file");
      } catch {
        file = join(OUT, path + ".html");
      }
      try {
        const bytes = await readFile(file);
        response.writeHead(200, {
          "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(bytes);
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHAT_CHROMIUM_PATH,
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      for (const scenario of [
        { expired: true, query: "?threadId=expired-thread" },
        { expired: true, query: "?threadId=expired-thread&assistantId=agent" },
        { expired: false, query: "?threadId=expired-thread" },
      ]) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.addInitScript(({ expired }) => {
            localStorage.setItem(
              "deep-agent-config",
              JSON.stringify({ assistantId: "agent" })
            );
            if (expired) {
              localStorage.setItem(
                "deep-agent-auth",
                JSON.stringify({
                  user_id: "test",
                  username: "test",
                  role: "user",
                  access_token: `e30.${btoa(JSON.stringify({ exp: 1 }))}.test`,
                })
              );
            }
          }, scenario);
          await page.route("**/api/**", (route) =>
            route.fulfill({
              contentType: "application/json",
              body: JSON.stringify({ require_invitation_code: false }),
            })
          );
          // Delay the login route payload to expose competing query-state writes.
          await page.route("**/chat/login.txt*", async (route) => {
            await new Promise((done) => setTimeout(done, 150));
            await route.continue();
          });
          await page.goto(`${origin}/chat/${scenario.query}`);
          await page
            .getByRole("heading", { name: "Sign In", exact: true })
            .waitFor({ timeout: 8000 });
          assert.equal(new URL(page.url()).pathname, "/chat/login");
          assert.equal(
            new URL(page.url()).searchParams.get("threadId"),
            "expired-thread"
          );
          assert.equal(
            await page.evaluate(() => localStorage.getItem("deep-agent-auth")),
            null
          );
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
