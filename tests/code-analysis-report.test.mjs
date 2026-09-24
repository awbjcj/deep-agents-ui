import test from "node:test";
import assert from "node:assert/strict";

import {
  analysisMatlabSummary,
  reportFilename,
} from "../src/lib/code-analysis.ts";

test("report downloads get a safe stable Markdown filename", () => {
  assert.equal(reportFilename("report-123"), "analysis-report-123.md");
  assert.equal(reportFilename("../../bad"), "analysis-report.md");
});

test("MATLAB report summaries keep only readable counts and state", () => {
  assert.deepEqual(
    analysisMatlabSummary({
      matlab: {
        initialization_status: "initialized",
        summary: { artifact_count: 12, model_count: 2, evidence_count: 5 },
        evidence: [{ private: "not projected" }],
      },
    }),
    {
      initializationStatus: "initialized",
      artifactCount: 12,
      modelCount: 2,
      evidenceCount: 5,
    }
  );
  assert.equal(analysisMatlabSummary({}), null);
});
