import test from "node:test";
import assert from "node:assert/strict";

import {
  analysisPollDelay,
  analysisJobSchema,
  analysisTargets,
  shouldPoll,
} from "../src/lib/code-analysis.ts";
import {
  analysisActivity,
  analysisElapsed,
  analysisPercentage,
  analysisPhase,
  preparationProgress,
} from "../src/lib/code-analysis-progress.ts";

test("unknown-duration analysis does not invent progress or a finish time", () => {
  const job = analysisJobSchema.parse({
    job_id: "job",
    status: "running",
    operation: "analyze",
    progress: 5,
    phase: "waiting_for_model",
    started_at: "2026-11-06T05:51:41Z",
  });
  assert.equal(analysisPercentage(job), null);
  assert.equal(analysisPhase(job)[0], "Waiting for model response");
  assert.equal(
    analysisElapsed(job, Date.parse("2026-11-06T05:53:44Z")),
    "2m 3s"
  );
  const failed = {
    ...job,
    operation: "prepare",
    status: "failed",
    finished_at: "2026-11-06T06:10:56Z",
  };
  assert.equal(analysisElapsed(failed, Date.now()), "19m 15s");
  assert.match(analysisPhase(failed)[1], /Analysis has not started/);
});

test("progress data rejects invalid counts and excludes arbitrary worker content", () => {
  const job = analysisJobSchema.parse({
    job_id: "job",
    status: "running",
    result: {
      activity: { tool_calls: 3, read_range_count: 2, command: "PRIVATE" },
      preparation: {
        completed_entries: 10,
        total_entries: 5,
        target_index: 1,
        target_count: 1,
      },
    },
  });
  assert.deepEqual(analysisActivity(job), {
    tool_calls: 3,
    read_range_count: 2,
  });
  assert.equal(preparationProgress(job), null);
});

test("transient job failures use a bounded polling backoff", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, Number.POSITIVE_INFINITY].map(analysisPollDelay),
    [2000, 4000, 8000, 16000, 30000, 30000, 2000]
  );
});

test("cancel acknowledgement remains pending until the process has exited", () => {
  assert.equal(shouldPoll("cancel_requested"), true);
  assert.equal(shouldPoll("cancelled"), false);
  assert.equal(shouldPoll("succeeded"), false);
});

test("durable job output preserves bounded progress and immutable target identities", () => {
  const job = analysisJobSchema.parse({
    job_id: "job-1",
    status: "running",
    phase: "fetching_targets",
    progress: 37,
    result: {
      targets: [
        {
          server_id: "gerrit-primary",
          repository: "team/repo",
          revision: "a".repeat(40),
        },
        { repository: "team/repo", revision: "missing-server" },
      ],
    },
  });

  assert.equal(job.progress, 37);
  assert.deepEqual(analysisTargets(job.result), [
    {
      serverId: "gerrit-primary",
      repository: "team/repo",
      revision: "a".repeat(40),
    },
  ]);
});
