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
              const effective = {provider: "test", model: "example", effort: "low", thinking: false, max_tokens: Number(new URLSearchParams(location.search).get("cap")) || 4096};
              export const apiGetUserModel = async () => ({effective, preset: null});
              const linked = new URLSearchParams(location.search).has("linked");
              const entry = {...effective, supports_effort: true, efforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"], supports_thinking: true, thinking_required: false, disabled_thinking_efforts: ["none", "minimal", "low", "medium", "high"]};
              const defaults = [{effort: "low", thinking: false, max_tokens: 8192}, {effort: "low", thinking: true, max_tokens: 12288}, {effort: "xhigh", thinking: true, max_tokens: 40960}];
              export const apiGetAllowedModels = async () => ({models: linked ? [{...entry, control_defaults: defaults}, {...entry, model: "alternative", recommended_effort: "medium", recommended_thinking: true, recommended_max_tokens: 16384, control_defaults: [{effort: "medium", thinking: true, max_tokens: 16384}]}] : [entry]});
              window.modelSaves = [];
              export const apiSetUserModel = async (payload) => { window.modelSaves.push(payload); if (window.modelSaveSucceeds) return {effective: {...effective, ...payload}, preset: null}; throw new Error("Save unavailable"); };
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
              export const apiFetch = async () => new Response(JSON.stringify([]), {headers: {"Content-Type": "application/json"}});
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
            build.onLoad({ filter: /[\\/]AuthProvider\.tsx$/ }, () => ({
              contents:
                'export const useAuth = () => ({user: {username: "fixture"}});',
              loader: "ts",
            }));
            build.onLoad(
              {
                filter:
                  /[\\/](ChatComposer|ChatMessage|NotificationBanner|PendingToolApproval|TasksFilesSidebar)\.tsx$/,
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
      await page.goto(`${url}?view=model&linked=1`);
      const linkedSlider = page.getByRole("slider", { name: "Output cap" });
      await linkedSlider.waitFor();
      await page.evaluate(() => {
        window.modelSaveSucceeds = true;
      });
      await page.getByRole("button", { name: "xhigh", exact: true }).click();
      const linkedThinking = page.getByRole("switch", {
        name: "Adaptive thinking",
      });
      assert.equal(await linkedThinking.getAttribute("aria-checked"), "true");
      assert.equal(
        await linkedSlider.getAttribute("aria-valuetext"),
        "40,960 tokens"
      );
      await page.waitForFunction(() => window.modelSaves.length === 1);
      assert.deepEqual(await page.evaluate(() => window.modelSaves[0]), {
        provider: "test",
        model: "example",
        effort: "xhigh",
        thinking: true,
        max_tokens: 40960,
      });
      await page.getByRole("button", { name: "low", exact: true }).click();
      assert.equal(
        await linkedSlider.getAttribute("aria-valuetext"),
        "12,288 tokens"
      );
      await page.waitForFunction(() => window.modelSaves.length === 2);
      await linkedThinking.click();
      assert.equal(await linkedThinking.getAttribute("aria-checked"), "false");
      assert.equal(
        await linkedSlider.getAttribute("aria-valuetext"),
        "8,192 tokens"
      );
      await page.waitForFunction(() => window.modelSaves.length === 3);
      assert.deepEqual(await page.evaluate(() => window.modelSaves[2]), {
        provider: "test",
        model: "example",
        effort: "low",
        thinking: false,
        max_tokens: 8192,
      });
      await page.getByRole("combobox", { name: "Model" }).click();
      await page.getByRole("option", { name: /alternative/ }).click();
      assert.equal(await linkedThinking.getAttribute("aria-checked"), "true");
      assert.equal(
        await linkedSlider.getAttribute("aria-valuetext"),
        "16,384 tokens"
      );
      await page.waitForFunction(() => window.modelSaves.length === 4);
      assert.deepEqual(await page.evaluate(() => window.modelSaves[3]), {
        provider: "test",
        model: "alternative",
        effort: "medium",
        thinking: true,
        max_tokens: 16384,
      });
      await page.goto(`${url}?view=model`);
      const slider = page.getByRole("slider", { name: "Output cap" });
      await slider.waitFor();
      const steps = page.getByRole("spinbutton", {
        name: "Maximum agent steps",
      });
      await steps.fill("10001");
      assert.equal(await steps.getAttribute("aria-invalid"), "true");
      assert.equal(
        await page.getByRole("button", { name: "Save limit" }).isDisabled(),
        true
      );
      await steps.fill("1500");
      await page.getByRole("button", { name: "Save limit" }).click();
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("vsda:run-limit:fixture")
        ),
        "1500"
      );
      await page.waitForTimeout(1000);
      assert.equal(
        await page.evaluate(() => window.modelSaves.length),
        0,
        "Loading settings must not round or save a cap"
      );
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => window.modelSaves.length === 1);
      assert.equal(
        await page.evaluate(() => window.modelSaves[0].max_tokens),
        8192,
        "Keyboard movement chooses the next common cap"
      );
      assert.equal(await slider.getAttribute("aria-valuetext"), "8,192 tokens");
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

      await page.goto(`${url}?view=model&cap=12345`);
      await slider.waitFor();
      assert.equal(await steps.inputValue(), "1500");
      await page.waitForTimeout(1000);
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "12,345 tokens"
      );
      assert.equal(await page.evaluate(() => window.modelSaves.length), 0);
      await page.getByRole("button", { name: "Increase output cap" }).click();
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "16,384 tokens"
      );
      await page.getByRole("button", { name: "Decrease output cap" }).click();
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "12,345 tokens",
        "Custom stops stay stable while editing"
      );
      await slider.focus();
      await page.keyboard.press("Home");
      assert.equal(await slider.getAttribute("aria-valuetext"), "512 tokens");
      assert.equal(
        await page
          .getByRole("button", { name: "Decrease output cap" })
          .isDisabled(),
        true
      );
      await page.keyboard.press("End");
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "65,536 tokens"
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Increase output cap" })
          .isDisabled(),
        true
      );
      // Pointer clicks on the native track must also select a discrete stop.
      const track = await slider.boundingBox();
      await page.mouse.click(
        track.x + track.width / 2,
        track.y + track.height / 2
      );
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "12,345 tokens"
      );
      await page.mouse.move(
        track.x + track.width / 2,
        track.y + track.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        track.x + track.width * 0.75,
        track.y + track.height / 2,
        { steps: 8 }
      );
      await page.mouse.up();
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "32,768 tokens",
        "Dragging snaps to a common cap"
      );
      await page.getByRole("button", { name: "xhigh", exact: true }).click();
      const thinking = page.getByRole("switch", { name: "Adaptive thinking" });
      assert.equal(await thinking.getAttribute("aria-checked"), "true");
      assert.equal(await thinking.isDisabled(), true);
      await page.getByRole("button", { name: "low", exact: true }).click();
      assert.equal(await thinking.isEnabled(), true);

      await page.evaluate(() => {
        window.modelSaveSucceeds = true;
      });
      await slider.focus();
      await page.keyboard.press("Home");
      for (let step = 0; step < 6; step++)
        await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () => window.modelSaves.at(-1)?.max_tokens === 16384
      );
      await page.getByRole("button", { name: "Increase output cap" }).waitFor();
      await page.getByRole("button", { name: "Decrease output cap" }).click();
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "12,345 tokens",
        "A successful autosave retains custom slider stops"
      );
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await slider.getAttribute("aria-valuetext"),
        "24,576 tokens"
      );

      for (const width of [320, 420]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate(
            (theme) =>
              document.documentElement.classList.toggle(
                "dark",
                theme === "dark"
              ),
            theme
          );
          await slider.scrollIntoViewIfNeeded();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true,
            "Settings fit narrow layouts"
          );
          assert.equal(
            await page
              .getByRole("combobox", { name: "Model", exact: true })
              .evaluate(
                (control) => control.getBoundingClientRect().right <= innerWidth
              ),
            true,
            "The settings scroll area must not hide overflow beyond the viewport"
          );
          assert.equal(
            await page
              .getByRole("button", { name: "xhigh", exact: true })
              .evaluate((button) => button.scrollWidth <= button.clientWidth),
            true
          );
          if (evidence)
            await page.screenshot({
              path: join(evidence, `model-settings-${width}-${theme}.png`),
            });
        }
      }

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
