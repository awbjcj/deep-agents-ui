import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analysisLimitsSchema,
  analysisSettingsSchema,
  engineCatalogSchema,
  matlabLimitsSchema,
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

test("MATLAB limits preserve byte units and single concurrency", () => {
  const defaults = matlabLimitsSchema.parse({});
  assert.equal(defaults.max_artifact_bytes, 256 * 1024 ** 2);
  assert.equal(defaults.max_download_bytes, 10 * 1024 ** 3);
  assert.equal(
    matlabLimitsSchema.safeParse({ concurrent_processes: 2 }).success,
    false
  );
  assert.equal(analysisSettingsSchema.parse({}).matlab.enabled, false);
});

test("engine catalog retains capability-specific MATLAB readiness", () => {
  const catalog = engineCatalogSchema.parse({
    default_engine: "deep_agent",
    engines: [
      {
        id: "deep_agent",
        ready: true,
        blockers: [],
        matlab: {
          configured: true,
          runtime_ready: true,
          toolkit_schemas_ready: true,
          skills_ready: true,
          initialization_ready: true,
          isolation_ready: true,
          broker_ready: true,
          gerrit_ready: true,
          plastic_ready: false,
          probe_fresh: true,
          blockers: [],
          ready: true,
          verified_at: "2026-09-12T12:00:00Z",
          configuration_digest: "a".repeat(64),
        },
      },
    ],
  });
  assert.equal(catalog.engines[0].matlab?.plastic_ready, false);
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
  assert.match(source, /MATLAB and Simulink/);
  assert.match(source, /Fixed at one isolated process/);
  assert.match(source, /Dependency server IDs/);
  assert.match(source, /max_dependency_restarts/);
  assert.match(source, /Last verified/);
  assert.match(source, /fieldErrors\[field.key\]/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
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
  assert.match(source, /MATLAB model evidence/);
  assert.match(source, /discovering dependencies/);
});
