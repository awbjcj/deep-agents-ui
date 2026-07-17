import assert from "node:assert/strict";
import test from "node:test";

import { splitUsageByEnforcement } from "../src/lib/usage.ts";

// Regression: the admin users panel used to render the token percentage
// unconditionally, so under proxy mode (call cap enforced) it showed a
// misleading token % (e.g. 19%) while only a few calls had been made.
// The enforced dimension must drive the primary meter.
test("proxy mode surfaces the call cap as the primary meter, not tokens", () => {
  const { primary, secondary } = splitUsageByEnforcement({
    used: 190_000,
    limit: 1_000_000,
    pct: 19,
    is_unlimited: false,
    calls_used: 3,
    calls_limit: 500,
    calls_pct: 0.6,
    calls_is_unlimited: false,
    enforced: "calls",
  });

  assert.equal(primary.dimension, "calls");
  assert.equal(primary.pct, 0.6);
  assert.equal(primary.used, 3);
  assert.equal(primary.limit, 500);
  assert.equal(primary.isUnlimited, false);

  // The non-enforced dimension is kept for context.
  assert.equal(secondary.dimension, "tokens");
  assert.equal(secondary.pct, 19);
});

test("remote/gateway mode surfaces the token cap as the primary meter", () => {
  const { primary, secondary } = splitUsageByEnforcement({
    used: 190_000,
    limit: 1_000_000,
    pct: 19,
    is_unlimited: false,
    calls_used: 3,
    calls_limit: 500,
    calls_pct: 0.6,
    calls_is_unlimited: false,
    enforced: "tokens",
  });

  assert.equal(primary.dimension, "tokens");
  assert.equal(primary.pct, 19);
  assert.equal(secondary.dimension, "calls");
  assert.equal(secondary.pct, 0.6);
});

test("unlimited flags follow the enforced dimension", () => {
  const { primary } = splitUsageByEnforcement({
    used: 0,
    limit: 0,
    pct: 0,
    is_unlimited: true,
    calls_used: 42,
    calls_limit: 500,
    calls_pct: 8.4,
    calls_is_unlimited: false,
    enforced: "calls",
  });

  assert.equal(primary.dimension, "calls");
  assert.equal(primary.isUnlimited, false);
  assert.equal(primary.pct, 8.4);
});
