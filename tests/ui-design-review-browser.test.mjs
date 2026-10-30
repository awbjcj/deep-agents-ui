import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "form focus, shared tooltip timing and narrow layouts remain usable",
  {
    skip: process.env.UI_DESIGN_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { default: config } = await import("../tailwind.config.mjs");
    const css = await postcss([tailwind(config)]).process(
      (
        await readFile(join(ROOT, "src/app/globals.css"), "utf8")
      ).replace('@import "katex/dist/katex.min.css";', ""),
      { from: join(ROOT, "src/app/globals.css") }
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { SkillCatalog } from "./src/app/components/skills/SkillCatalog";
        import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./src/components/ui/tooltip";
        import { TooltipIconButton } from "./src/components/ui/tooltip-icon-button";
        import { Button } from "./src/components/ui/button";
        const entries = [
          {id:"private",name:"release-review",description:"Review changes, check evidence and prepare release notes.",origin:"personal",availability:"available",revision:1,created_at:null,updated_at:null},
          {id:"system",name:"document-review",description:"Read source documents and explain the findings with references.",origin:"system",availability:"available",revision:null,created_at:null,updated_at:null},
        ];
        function Fixture() {
          const [selected, setSelected] = React.useState(null);
          return <TooltipProvider><main className="mx-auto max-w-3xl p-4 sm:p-8">
            <h1 className="mb-6 text-2xl font-semibold">Workspace settings</h1>
            <h2 className="mb-4 text-lg">Library</h2>
            <SkillCatalog entries={entries} selectedKey={selected} onSelect={entry => setSelected(entry.origin+":"+entry.id)} onCreate={()=>{}} onImport={()=>{}} />
            <div className="mt-6 flex flex-wrap gap-3" aria-label="Help controls">
              <Tooltip><TooltipTrigger asChild><Button variant="outline">Library help</Button></TooltipTrigger><TooltipContent>Use skills in any conversation.</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline">Package help</Button></TooltipTrigger><TooltipContent>This explanation remains readable near the edge of a narrow screen, including an unusually long resource identifier: references/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md</TooltipContent></Tooltip>
              <TooltipIconButton icon={<span aria-hidden="true">?</span>} tooltip="Import help" onClick={()=>{}} />
            </div>
          </main></TooltipProvider>;
        }
        createRoot(document.getElementById("root")).render(<Fixture />);
      `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer(async (request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(bundle.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(css.css);
      } else if (/^\/fonts\/[\w.-]+$/.test(request.url ?? "")) {
        try {
          response.end(await readFile(join(ROOT, "public", request.url)));
        } catch {
          response.writeHead(404).end();
        }
      } else {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<!doctype html><html lang="en"><head><title>UI design regression fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const evidence = process.env.UI_DESIGN_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const url = `http://127.0.0.1:${server.address().port}`;
      const tooltip = page.locator('[data-slot="tooltip-content"]');
      for (const width of [320, 768, 1024, 1440]) {
        for (const theme of ["light", "dark"]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(url);
          await page.evaluate(
            (theme) =>
              document.documentElement.classList.toggle(
                "dark",
                theme === "dark"
              ),
            theme
          );
          const search = page.getByRole("searchbox", { name: "Search skills" });
          await search.waitFor();
          await page.keyboard.press("Tab");
          await page.keyboard.press("Tab");
          await page.keyboard.press("Tab");
          assert.equal(
            await search.evaluate((el) => el === document.activeElement),
            true
          );
          assert.notEqual(
            await search.evaluate((el) => getComputedStyle(el).boxShadow),
            "none",
            "Search retains its keyboard focus ring"
          );
          await page.keyboard.press("Tab");
          const origin = page.getByRole("combobox", {
            name: "Filter skill origin",
          });
          assert.equal(
            await origin.evaluate((el) => el === document.activeElement),
            true
          );
          assert.notEqual(
            await origin.evaluate((el) => getComputedStyle(el).boxShadow),
            "none",
            "Native origin selector retains its keyboard focus ring"
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          );
          if (evidence)
            await page.screenshot({
              path: join(evidence, `catalog-${width}-${theme}.png`),
            });
          await search.fill("missing-match");
          await page.getByRole("button", { name: "Clear filters" }).click();
          assert.equal(await search.inputValue(), "");
        }
      }
      await page.goto(url);
      await page
        .getByRole("button", { name: "Library help", exact: true })
        .hover();
      await page.waitForTimeout(100);
      assert.equal(
        await tooltip.count(),
        0,
        "Passing over a control does not flash a tooltip"
      );
      await tooltip.waitFor();
      assert.equal(await tooltip.getAttribute("data-state"), "delayed-open");
      // Exercise a real pointer path through Radix's hoverable-content grace area.
      const moveTo = async (name) => {
        const bounds = await page
          .getByRole("button", { name, exact: true })
          .boundingBox();
        await page.mouse.move(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
          { steps: 12 }
        );
      };
      await moveTo("Package help");
      await tooltip.filter({ hasText: "This explanation" }).waitFor();
      assert.equal(
        await tooltip.getAttribute("data-state"),
        "instant-open",
        "Adjacent controls share warm tooltip timing"
      );
      await moveTo("Import help");
      await tooltip.filter({ hasText: "Import help" }).waitFor();
      assert.equal(
        await tooltip.getAttribute("data-state"),
        "instant-open",
        "Icon buttons retain the shared timing scope"
      );
      for (const reducedMotion of ["reduce", "no-preference"]) {
        await page.emulateMedia({ reducedMotion });
        await page.setViewportSize({ width: 320, height: 1000 });
        await page.goto(url);
        await page.keyboard.press("Tab");
        const help = page.getByRole("button", {
          name: "Package help",
          exact: true,
        });
        await help.focus();
        await tooltip.waitFor();
        assert.equal(await tooltip.getAttribute("data-state"), "instant-open");
        assert.equal(
          await tooltip.evaluate((el) => getComputedStyle(el).animationName),
          "none"
        );
        const bounds = await tooltip.boundingBox();
        assert(
          bounds.x >= 0 && bounds.x + bounds.width <= 320,
          "Long tooltip fits the viewport"
        );
        assert.equal(
          await tooltip.evaluate((el) => el.scrollWidth <= el.clientWidth),
          true
        );
        if (evidence)
          await page.screenshot({
            path: join(evidence, `tooltip-${reducedMotion}.png`),
          });
        await page.keyboard.press("Escape");
        await tooltip.waitFor({ state: "hidden" });
        assert.equal(
          await help.evaluate((el) => el === document.activeElement),
          true
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
