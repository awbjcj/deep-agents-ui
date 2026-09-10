import test from "node:test";
import assert from "node:assert/strict";

import { reportFilename } from "../src/lib/code-analysis.ts";

test("report downloads get a safe stable Markdown filename", () => {
  assert.equal(reportFilename("report-123"), "analysis-report-123.md");
  assert.equal(reportFilename("../../bad"), "analysis-report.md");
});
