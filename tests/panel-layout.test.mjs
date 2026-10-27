import assert from "node:assert/strict";
import test from "node:test";
import { getPanelLayout } from "../src/lib/panel-layout.ts";

test("column budgets remain feasible across desktop sizes and panel combinations", () => {
  for (const width of [1280, 1440, 1920, 3440, 5120]) {
    for (const threadsOpen of [false, true]) {
      for (const settingsOpen of [false, true]) {
        const layout = getPanelLayout({
          width,
          alignedWidth: 690,
          threadsOpen,
          settingsOpen,
        });
        const pixels = (size) => (size * layout.availableWidth) / 100;
        assert.ok(Math.abs(pixels(layout.chat.minSize) - 480) < 0.01);
        assert.ok(pixels(layout.threads.maxSize) <= 360.01);
        assert.ok(pixels(layout.settings.maxSize) <= 768.01);
        const defaultSidebars =
          (threadsOpen ? layout.threads.defaultSize : 0) +
          (settingsOpen ? layout.settings.defaultSize : 0);
        assert.ok(defaultSidebars + layout.chat.minSize <= 100.001);
        assert.ok(layout.settings.minSize <= layout.settings.defaultSize);
        assert.ok(layout.settings.defaultSize <= layout.settings.maxSize);
      }
    }
  }
});

test("header alignment yields to readable columns when space is constrained", () => {
  const desktop = getPanelLayout({
    width: 1920,
    alignedWidth: 690,
    threadsOpen: true,
    settingsOpen: true,
  });
  assert.ok(
    Math.abs(
      (desktop.settings.defaultSize * desktop.availableWidth) / 100 - 690
    ) < 0.01
  );
  const narrow = getPanelLayout({
    width: 1280,
    alignedWidth: 690,
    threadsOpen: true,
    settingsOpen: true,
  });
  const settingsWidth =
    (narrow.settings.defaultSize * narrow.availableWidth) / 100;
  assert.ok(settingsWidth >= 432 && settingsWidth < 690);
  assert.ok(1280 - 2 - 288 - settingsWidth >= 480);
});
