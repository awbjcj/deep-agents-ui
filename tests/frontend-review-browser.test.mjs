import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "settings preserve edits, failed autosaves stop, and task/motion states remain accurate",
  { skip: process.env.FRONTEND_REVIEW_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { default: config } = await import("../tailwind.config.mjs");
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
          import { ModelSidebar } from "./src/app/components/ModelSidebar";
          import { ConnectivitySidebar } from "./src/app/components/ConnectivitySidebar";
          import { ChatInterface } from "./src/app/components/ChatInterface";
          import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "./src/components/ui/dialog";
          import { Tooltip, TooltipTrigger, TooltipContent } from "./src/components/ui/tooltip";
          import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./src/components/ui/select";
          function MotionFixture() {
            return <div style={{padding: 40}}>
              <Dialog><DialogTrigger>Open dialog</DialogTrigger><DialogContent><DialogTitle>Motion review</DialogTitle><DialogDescription>Review dialog motion</DialogDescription></DialogContent></Dialog>
              <Tooltip><TooltipTrigger>Tooltip target</TooltipTrigger><TooltipContent side="bottom" align="start">Tooltip details</TooltipContent></Tooltip>
              <Select><SelectTrigger aria-label="Choose option"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem></SelectContent></Select>
            </div>;
          }
          const view = new URLSearchParams(location.search).get("view");
          createRoot(document.getElementById("root")).render(<React.StrictMode>{
            view === "model" ? <ModelSidebar /> : view === "connectivity" ? <ConnectivitySidebar /> : view === "chat" ? <ChatInterface assistant={null} /> : <MotionFixture />
          }</React.StrictMode>);
        `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      plugins: [
        {
          name: "isolated-services",
          setup(build) {
            build.onLoad({ filter: /[\\/]lib[\\/]auth\.ts$/ }, () => ({
              contents: `
              const effective = {provider: "test", model: "example", effort: "low", thinking: false, max_tokens: 4096};
              export const apiGetUserModel = async () => ({effective, preset: null});
              export const apiGetAllowedModels = async () => ({models: [{...effective, supports_effort: true, efforts: ["low", "high"], supports_thinking: true, thinking_required: false}]});
              window.modelSaves = [];
              export const apiSetUserModel = async (payload) => { window.modelSaves.push(payload); throw new Error("Save unavailable"); };
              let connectivity = {run_mode: "gateway", proxy_url: "https://saved.example", default_run_mode: "gateway", run_mode_source: "user", proxy_url_source: "user"};
              export const apiGetUserConnectivity = async () => connectivity;
              window.connectivitySaves = [];
              export const apiSetUserConnectivity = (payload) => {
                window.connectivitySaves.push(payload);
                return new Promise((resolve, reject) => {
                  window.rejectConnectivity = () => reject(new Error("Save unavailable"));
                  window.resolveConnectivity = () => { connectivity = {...connectivity, ...payload}; resolve(connectivity); };
                });
              };
              export const apiGetImageFetching = async () => ({enabled: false, effective: false, sources: null});
              export const apiSetImageFetching = apiGetImageFetching;
            `,
              loader: "ts",
            }));
            build.onLoad({ filter: /[\\/]ConnectivityProvider\.tsx$/ }, () => ({
              contents:
                "const setRunModeLocal = () => {}; export const useConnectivity = () => ({setRunModeLocal});",
              loader: "ts",
            }));
            build.onLoad({ filter: /[\\/]useTokenUsage\.ts$/ }, () => ({
              contents: "export const useTokenUsage = () => null;",
              loader: "ts",
            }));
            build.onLoad(
              {
                filter:
                  /[\\/](RunLimitSettings|ChatComposer|ChatMessage|NotificationBanner|PendingToolApproval|TasksFilesSidebar)\.tsx$/,
              },
              ({ path }) => ({
                contents: `export const ${
                  path.split(/[\\/]/).pop().replace(".tsx", "") ===
                  "TasksFilesSidebar"
                    ? "FilesPopover"
                    : path.split(/[\\/]/).pop().replace(".tsx", "")
                } = () => null;`,
                loader: "tsx",
              })
            );
            build.onLoad({ filter: /[\\/]ChatProvider\.tsx$/ }, () => ({
              contents: `
              import React from "react";
              export function useChatContext() {
                const [status, setStatus] = React.useState("in_progress");
                React.useEffect(() => { window.completeTask = () => setStatus("completed"); }, []);
                return {threadId: "test", todos: [{id: "one", content: "Still working", status}], files: {}, processedMessages: [], ui: [], isLoading: false, isThreadLoading: false};
              }
            `,
              loader: "tsx",
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer((request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(bundle.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(css.css);
      } else {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="root" style="position:relative;height:100dvh;display:flex;flex-direction:column"></main><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const url = `http://127.0.0.1:${server.address().port}`;
    const evidence = process.env.FRONTEND_REVIEW_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 420, height: 900 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${url}?view=model`);
      const slider = page.getByRole("slider", { name: "Output cap" });
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => window.modelSaves.length === 1);
      await page.waitForTimeout(1900);
      assert.equal(
        await page.evaluate(() => window.modelSaves.length),
        1,
        "A failed autosave must not retry itself"
      );
      await page
        .getByRole("button", { name: "Save custom configuration" })
        .click();
      await page.waitForFunction(() => window.modelSaves.length === 2);
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => window.modelSaves.length === 3);
      if (evidence)
        await page.screenshot({ path: join(evidence, "model-settings.png") });

      await page.goto(`${url}?view=connectivity`);
      await page.getByRole("radio", { name: /proxy/ }).click();
      const proxy = page.getByPlaceholder("(not set — using system proxy)");
      await proxy.fill("https://draft.example");
      await page.waitForFunction(() => window.connectivitySaves.length === 1);
      await page.evaluate(() => window.resolveConnectivity());
      await page.getByRole("radio", { name: /remote/ }).click();
      await page.waitForFunction(() => window.connectivitySaves.length === 2);
      await page.getByRole("radio", { name: /proxy/ }).click();
      await page.evaluate(() => window.resolveConnectivity());
      await page.waitForFunction(() => window.connectivitySaves.length === 3);
      assert.equal(
        await proxy.inputValue(),
        "https://draft.example",
        "Mode-only responses must preserve the proxy draft"
      );
      assert.equal(
        await page
          .getByRole("radio", { name: /proxy/ })
          .getAttribute("aria-checked"),
        "true",
        "An older save must not replace the latest choice"
      );
      await page.evaluate(() => window.rejectConnectivity());
      await page.waitForTimeout(1100);
      assert.equal(
        await page.evaluate(() => window.connectivitySaves.length),
        3
      );
      await page.getByRole("radio", { name: /remote/ }).click();
      await page.getByRole("radio", { name: /proxy/ }).click();
      await page.waitForFunction(() => window.connectivitySaves.length === 4);
      await page.evaluate(() => window.resolveConnectivity());
      await page.getByRole("button", { name: "Save connectivity" }).click();
      await page.waitForFunction(() => window.connectivitySaves.length === 5);
      await proxy.fill("https://newer-draft.example");
      await page.evaluate(() => window.resolveConnectivity());
      await page.getByRole("button", { name: "Save connectivity" }).waitFor();
      assert.equal(await proxy.inputValue(), "https://newer-draft.example");
      if (evidence)
        await page.screenshot({
          path: join(evidence, "connectivity-settings.png"),
        });

      await page.goto(`${url}?view=chat`);
      await page.getByRole("button", { name: /Still working/ }).waitFor();
      assert.equal(await page.getByText("All tasks completed").count(), 0);
      await page.evaluate(() => window.completeTask());
      await page.getByText("All tasks completed").waitFor();

      for (const reducedMotion of ["no-preference", "reduce"]) {
        await page.setViewportSize(
          reducedMotion === "reduce"
            ? { width: 420, height: 900 }
            : { width: 1280, height: 900 }
        );
        await page.emulateMedia({ reducedMotion });
        await page.goto(`${url}?view=motion`);
        await page.getByRole("button", { name: "Open dialog" }).click();
        const dialog = page.getByRole("dialog");
        const styles = await dialog.evaluate((el) => ({
          name: getComputedStyle(el).animationName,
          easing: getComputedStyle(el).animationTimingFunction,
        }));
        assert.equal(
          styles.name,
          reducedMotion === "reduce" ? "none" : "enter"
        );
        if (reducedMotion === "no-preference")
          assert.equal(styles.easing, "cubic-bezier(0.23, 1, 0.32, 1)");
        if (evidence)
          await page.screenshot({
            path: join(evidence, `dialog-${reducedMotion}.png`),
          });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Tooltip target" }).hover();
        const tooltip = page.locator('[data-slot="tooltip-content"]');
        await tooltip.waitFor();
        const origin = await tooltip.evaluate((el) => {
          const actual = getComputedStyle(el).transformOrigin;
          el.style.transformOrigin =
            "var(--radix-tooltip-content-transform-origin)";
          const expected = getComputedStyle(el).transformOrigin;
          el.style.removeProperty("transform-origin");
          return { actual, expected };
        });
        assert.equal(
          origin.actual,
          origin.expected,
          "Tooltip scales from its trigger"
        );
        if (reducedMotion === "reduce")
          assert.equal(
            await tooltip.evaluate((el) => getComputedStyle(el).animationName),
            "none"
          );
        await page.keyboard.press("Escape");
        await tooltip.waitFor({ state: "hidden" });
        await page.getByRole("combobox").click();
        const optionList = page.getByRole("listbox");
        await optionList.waitFor();
        if (reducedMotion === "reduce")
          assert.equal(
            await optionList.evaluate(
              (el) => getComputedStyle(el).animationName
            ),
            "none"
          );
        await page.getByRole("option", { name: "One" }).click();
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
