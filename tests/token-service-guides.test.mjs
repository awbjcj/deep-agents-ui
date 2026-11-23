import assert from "node:assert/strict";
import test from "node:test";
import { hasSavedToken } from "../src/app/components/tokenServiceGuides.ts";

test("missing or unreadable credentials need reconnection instead of a Saved badge", () => {
  for (const preview of [
    undefined,
    null,
    "",
    "  ",
    "(not set)",
    "(unavailable)",
  ]) {
    assert.equal(hasSavedToken(preview), false, String(preview));
  }
  assert.equal(hasSavedToken("••••abcd"), true);
});
