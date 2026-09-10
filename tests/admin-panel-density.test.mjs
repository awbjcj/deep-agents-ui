import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin navigation uses an exact two-row tab layout", async () => {
  const [panel, tabs, page] = await Promise.all([
    readFile(
      new URL("../src/app/components/AdminPanel.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../src/components/ui/panel-tabs.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(panel, /layout="two-row"/);
  assert.match(tabs, /Math\.ceil\(\s*tabs\.length \/ 2\s*\)/);
  assert.match(tabs, /gridTemplateColumns/);
  assert.match(tabs, /isTwoRow && "w-full justify-center px-2"/);
  assert.match(
    page,
    /id="admin-panel"[\s\S]*defaultSize=\{34\}[\s\S]*minSize=\{30\}[\s\S]*min-w-\[500px\]/
  );
});

test("detailed admin settings are collapsed by default", async () => {
  const [primitives, limits, runMode, tiers] = await Promise.all([
    readFile(
      new URL("../src/app/components/admin/primitives.tsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL(
        "../src/app/components/admin/UsageLimitControls.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../src/app/components/admin/RunModeSection.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../src/app/components/admin/TiersSection.tsx", import.meta.url),
      "utf8"
    ),
  ]);

  assert.match(primitives, /<details/);
  assert.match(primitives, /<summary/);
  assert.doesNotMatch(primitives, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(primitives, /group-open:rotate-180/);
  assert.match(limits, /<DisclosureSection[\s\S]*title="Usage limits"/);
  assert.match(runMode, /<DisclosureSection[\s\S]*title="URL overrides"/);
  assert.match(tiers, /<DisclosureSection[\s\S]*title="Source images"/);
});

test("admin user quotas default to the token view", async () => {
  const users = await readFile(
    new URL("../src/app/components/admin/UsersSection.tsx", import.meta.url),
    "utf8"
  );

  assert.match(users, /useState<UsageDimension>\("tokens"\)/);
  assert.match(users, /const usageDim = usageView;/);
});
