import test from "node:test";
import assert from "node:assert/strict";

import {
  analysisJobSchema,
  analysisTargets,
  shouldPoll,
} from "../src/lib/code-analysis.ts";

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
