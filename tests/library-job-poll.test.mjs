import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTerminal,
  nextPollDelay,
  describeJob,
  jobStatusLabel,
} from "../src/lib/library-job-poll.ts";

test("terminal statuses stop the poll loop", () => {
  assert.equal(isTerminal("succeeded"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("interrupted"), true);
  assert.equal(isTerminal("queued"), false);
  assert.equal(isTerminal("running"), false);
});

test("polling backs off after the first minute", () => {
  assert.equal(nextPollDelay(0), 2000);
  assert.equal(nextPollDelay(59_000), 2000);
  assert.equal(nextPollDelay(60_000), 5000);
  assert.equal(nextPollDelay(600_000), 5000);
});

test("describeJob reports the phase while running", () => {
  assert.equal(
    describeJob({
      status: "running",
      phase: "extracting",
      extracted_records: 0,
    }),
    "Extracting from source"
  );
  assert.equal(
    describeJob({
      status: "running",
      phase: "writing",
      extracted_records: 1234,
    }),
    "Writing 1,234 records"
  );
});

test("describeJob reports counts on success", () => {
  assert.equal(
    describeJob({
      status: "succeeded",
      phase: "done",
      upserts: 10,
      metadata_updates: 3,
      tombstones: 2,
    }),
    "10 upserts, 3 metadata updates, 2 tombstones"
  );
});

test("describeJob surfaces the real error, never a generic string", () => {
  assert.equal(
    describeJob({ status: "failed", error: "extractor exploded" }),
    "extractor exploded"
  );
  assert.equal(
    describeJob({ status: "interrupted", error: "Backend restarted" }),
    "Backend restarted"
  );
});

test("the badge names the operation in flight, not the status enum", () => {
  assert.equal(
    jobStatusLabel({ operation: "rebuild", status: "running" }),
    "Rebuilding"
  );
  assert.equal(
    jobStatusLabel({ operation: "sync", status: "running" }),
    "Syncing"
  );
  assert.equal(
    jobStatusLabel({ operation: "sync", status: "queued" }),
    "Queued"
  );
});
