import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin console exposes all three weekly cap switches", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/admin/UsageLimitControls.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /Usage limits/);
  assert.match(source, /cost_enabled/);
  assert.match(source, /token_enabled/);
  assert.match(source, /call_enabled/);
  assert.match(source, /htmlFor=\{controlId\}/);
  assert.match(source, /id=\{controlId\}/);
});

test("weekly cap controls use the admin settings API", async () => {
  const source = await readFile(
    new URL("../src/lib/auth.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /apiGetWeeklyLimitSettings/);
  assert.match(source, /apiSetWeeklyLimitSettings/);
  assert.match(source, /\/admin\/weekly-limit-settings/);
  assert.match(source, /method: "PUT"/);
});

test("usage toggle and summaries expose estimated cost", async () => {
  const [toggle, usageHook, adminApi] = await Promise.all([
    readFile(
      new URL(
        "../src/app/components/UsageDimensionToggle.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../src/app/hooks/useTokenUsage.ts", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(toggle, /value: "cost"/);
  assert.match(toggle, /label: "Cost"/);
  assert.match(usageHook, /cost_used_usd/);
  assert.match(adminApi, /cost_used_usd/);
});

test("admin console edits token, call, and cost defaults for every tier", async () => {
  const [panel, api] = await Promise.all([
    readFile(
      new URL(
        "../src/app/components/admin/UsageLimitControls.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(panel, /Tier defaults/);
  assert.match(panel, /ROLES\.map\(\(role\)/);
  assert.match(panel, />Tokens</);
  assert.match(panel, />Calls</);
  assert.match(panel, />Cost \(USD\)</);
  assert.match(panel, /0 = unlimited/);
  assert.match(api, /apiGetTierQuotaLimits/);
  assert.match(api, /apiSetTierQuotaLimits/);
  assert.match(api, /\/admin\/tier-token-limits\//);
  assert.match(api, /\/admin\/tier-call-limits\//);
  assert.match(api, /\/admin\/tier-cost-limits\//);
});

test("usage limit controls use compact aligned geometry", async () => {
  const [limits, toggle] = await Promise.all([
    readFile(
      new URL(
        "../src/app/components/admin/UsageLimitControls.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../src/app/components/UsageDimensionToggle.tsx",
        import.meta.url
      ),
      "utf8"
    ),
  ]);

  assert.match(limits, /overflow-x-auto/);
  assert.match(limits, /min-w-\[480px\]/);
  assert.match(limits, /grid-cols-\[76px_/);
  assert.match(limits, /h-8 w-16/);
  assert.doesNotMatch(limits, /transition-all/);
  assert.match(toggle, /inline-grid h-8 grid-cols-3/);
  assert.match(toggle, /active:scale-\[0\.97\]/);
});

test("a partly-applied tier save reports which dimensions persisted", async () => {
  const api = await readFile(
    new URL("../src/lib/auth.ts", import.meta.url),
    "utf8"
  );

  const start = api.indexOf("export async function apiSetTierQuotaLimits");
  assert.notEqual(start, -1, "apiSetTierQuotaLimits should exist");
  // Slice out just this function so the assertions below cannot be satisfied
  // — or broken — by unrelated code elsewhere in auth.ts.
  const offset = api.slice(start + 1).search(/^export /m);
  const body =
    offset === -1 ? api.slice(start) : api.slice(start, start + 1 + offset);

  // The three quota endpoints are independent PUTs, so the save must not
  // short-circuit — it has to learn the fate of all three to describe the
  // resulting mixed state.
  assert.match(body, /Promise\.allSettled\(/);
  assert.doesNotMatch(body, /Promise\.all\(/);
  assert.match(body, /this tier is now partly updated/);
});

test("tier quota inputs lock while that tier's save is in flight", async () => {
  const panel = await readFile(
    new URL(
      "../src/app/components/admin/UsageLimitControls.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(panel, /const isSavingRow = savingTier === role;/);
  // Tokens, calls and cost inputs all honour the in-flight lock.
  assert.equal(panel.match(/disabled=\{isSavingRow\}/g)?.length, 3);
});
