import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analysisLimitsSchema,
  analysisSettingsSchema,
  engineCatalogSchema,
} from "../src/lib/code-analysis.ts";

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

test("engine settings keep the upgrade default and strict native limits", () => {
  const settings = analysisSettingsSchema.parse({});
  assert.equal(settings.default_engine, "copilot");
  assert.equal(settings.native_limits.max_tokens, 100000);
  assert.equal(settings.native_limits.max_tool_calls, 200);
});

test("engine catalog rejects unknown engine identifiers", () => {
  assert.throws(() =>
    engineCatalogSchema.parse({ default_engine: "other", engines: [] })
  );
});

test("analysis settings UI groups raw limits and validates model overrides inline", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/admin/CodeAnalysisSettings.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /title: "Throughput"/);
  assert.match(source, /title: "Workspace lifecycle"/);
  assert.match(source, /title: "Health and artifacts"/);
  assert.match(source, /Enter both a provider and model/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /Settings unavailable/);
  assert.doesNotMatch(source, /saveAnalysisSettings/);
  assert.match(source, /limits: input/);
  assert.match(source, /<fieldset[\s\S]*disabled=\{saving\}/);
});

test("analysis job UI exposes live status, progress, and evidence landmarks", async () => {
  const source = await readFile(
    new URL("../src/app/components/CodeAnalysisJob.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Evidence coverage/);
  assert.match(source, /Immutable targets/);
  assert.match(source, /motion-reduce:transition-none/);
});
