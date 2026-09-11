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
  assert.match(tabs, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(tabs, /isTwoRow &&[\s\S]*"w-full min-w-0 justify-center/);
  assert.doesNotMatch(panel, /id: "registration"/);
  const destinations = [
    ["users", "People"],
    ["tiers", "Models"],
    ["tools", "Tools"],
    ["runmode", "Runtime"],
    ["scopes", "Memories"],
    ["library", "Search"],
    ["scm", "Sources"],
    ["newsletters", "Newsletters"],
  ];
  let previous = -1;
  for (const [id, label] of destinations) {
    const position = panel.indexOf(`id: "${id}", label: "${label}"`);
    assert(position > previous, `${label} should appear in row-major order`);
    previous = position;
  }
  assert.match(
    page,
    /id="admin-panel"[\s\S]*defaultSize=\{34\}[\s\S]*minSize=\{30\}[\s\S]*min-w-\[500px\]/
  );
});

test("relocated detailed settings are independently mounted and collapsed", async () => {
  const [primitives, limits, runtime, tiers, sourcePolicy, connectivity] =
    await Promise.all([
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
          "../src/app/components/admin/RuntimeSection.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../src/app/components/admin/TiersSection.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../src/app/components/admin/SourceImagePolicySection.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../src/app/components/admin/ConnectivitySettingsSections.tsx",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

  assert.match(primitives, /<details/);
  assert.match(primitives, /<summary/);
  assert.doesNotMatch(primitives, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(primitives, /group-open:rotate-180/);
  assert.match(limits, /<DisclosureSection[\s\S]*title="Usage limits"/);
  assert.match(runtime, /title="Execution resources"/);
  assert.match(connectivity, /title="Provider endpoints"/);
  assert.match(sourcePolicy, /title="Tier policies"/);
  assert.match(tiers, /<UsageLimitControls \/>/);
  assert.doesNotMatch(tiers, /SourceImageControls/);
  assert.doesNotMatch(connectivity, /apiGetRunMode|RunModeSection/);
});

test("admin user quotas default to the token view", async () => {
  const users = await readFile(
    new URL("../src/app/components/admin/UsersSection.tsx", import.meta.url),
    "utf8"
  );

  assert.match(users, /useState<UsageDimension>\("tokens"\)/);
  assert.match(users, /const usageDim = usageView;/);
  assert.doesNotMatch(users, /UsageLimitControls/);
});

test("workspace tabs preserve ids and use the compact requested order", async () => {
  const workspace = await readFile(
    new URL("../src/app/components/WorkspacePanel.tsx", import.meta.url),
    "utf8"
  );
  const destinations = [
    ["models", "Models"],
    ["tools", "Tools"],
    ["tokens", "Tokens"],
    ["connectivity", "Connections"],
  ];
  let previous = -1;
  for (const [id, label] of destinations) {
    const position = workspace.indexOf(`id: "${id}", label: "${label}"`);
    assert(position > previous, `${label} should appear in order`);
    previous = position;
  }
  assert.match(workspace, /grid grid-cols-4 gap-1/);
  assert.match(workspace, /initialTokenFocus/);
});
