import test from "node:test";
import assert from "node:assert/strict";

import { analysisLimitsSchema } from "../src/lib/code-analysis.ts";

test("analysis limits reject inconsistent resource bounds before submission", () => {
  const base = analysisLimitsSchema.parse({});
  assert.throws(
    () =>
      analysisLimitsSchema.parse({
        ...base,
        worker_max_bytes: base.session_max_bytes - 1,
      }),
    /worker_max_bytes/
  );
  assert.throws(
    () =>
      analysisLimitsSchema.parse({
        ...base,
        list_default: 201,
      }),
    /list_default/
  );
});
