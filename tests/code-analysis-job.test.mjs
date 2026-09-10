import test from "node:test";
import assert from "node:assert/strict";

import {
  analysisPollDelay,
  analysisJobSchema,
  analysisTargets,
  shouldPoll,
} from "../src/lib/code-analysis.ts";

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
