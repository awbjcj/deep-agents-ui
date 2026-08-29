import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin console exposes all three weekly cap switches", async () => {
  const source = await readFile(
    new URL("../src/app/components/AdminPanel.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /Weekly limit caps/);
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
