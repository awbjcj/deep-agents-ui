import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "profile refresh cannot update a session after its provider unmounts",
  { skip: process.env.AUTH_PROVIDER_BROWSER_TEST !== "1" },
  async () => {
    const root = resolve(import.meta.dirname, "..");
    const { build } = await import("esbuild");
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { AuthProvider } from './src/providers/AuthProvider';
          function Fixture() {
            const [mounted, setMounted] = React.useState(true);
            return <><button id="unmount" onClick={() => setMounted(false)}>Unmount</button>
              {mounted && <AuthProvider><div>Mounted</div></AuthProvider>}</>;
          }
          createRoot(document.getElementById('root')).render(<Fixture />);
        `,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer((request, response) => {
      if (request.url === "/bundle.js") {
        response.writeHead(200, { "content-type": "text/javascript" });
        response.end(bundle.outputFiles[0].text);
      } else {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(
          '<div id="root"></div><script type="module" src="/bundle.js"></script>'
        );
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        const payload = btoa(JSON.stringify({ exp: 4102444800 }));
        localStorage.setItem(
          "deep-agent-auth",
          JSON.stringify({
            user_id: "alice",
            username: "alice",
            role: "user",
            access_token: `fixture.${payload}.signature`,
          })
        );
      });
      let release;
      let requestStarted;
      const started = new Promise((resolveStarted) => {
        requestStarted = resolveStarted;
      });
      const gate = new Promise((resolveGate) => {
        release = resolveGate;
      });
      await page.route("**/api/user/profile", async (route) => {
        requestStarted();
        await gate;
        await route.fulfill({
          json: { role: "admin", email: "alice@example.test" },
        });
      });
      const { port } = server.address();
      await page.goto(`http://127.0.0.1:${port}`);
      await started;
      await page.click("#unmount");
      const response = page.waitForResponse("**/api/user/profile");
      release();
      await response;
      await page.waitForTimeout(100);
      const role = await page.evaluate(
        () => JSON.parse(localStorage.getItem("deep-agent-auth")).role
      );
      assert.equal(role, "user");
    } finally {
      await browser.close();
      server.close();
      await once(server, "close");
    }
  }
);
