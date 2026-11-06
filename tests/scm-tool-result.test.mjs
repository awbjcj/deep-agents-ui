import assert from "node:assert/strict";
import test from "node:test";
import { scmToolMarkdown } from "../src/lib/scm-tool-result.ts";

test("SCM summaries render for their own tools and subsequent job polls", () => {
  for (const [name, heading] of [
    ["get_scm_revision", "SCM revision resolved"],
    ["get_scm_revision", "SCM revision resolution"],
    ["validate_scm_access", "SCM access validation"],
    ["get_code_analysis_job", "SCM revision resolution"],
    ["get_code_analysis_job", "SCM access validation"],
  ]) {
    const result = `### ${heading}\n\n- Status: \`running\``;
    assert.equal(scmToolMarkdown(name, result), result);
    assert.equal(scmToolMarkdown("read_file", result), null);
  }
});

test("legacy records and structured errors keep the raw result fallback", () => {
  for (const result of [
    { job_id: "job-1", status: "running" },
    JSON.stringify({ job_id: "job-1", status: "running" }),
    { ok: false, error: { code: "credentials_invalid" } },
    "Error running validate_scm_access: unavailable",
    "### Unrelated heading\n",
    null,
  ])
    assert.equal(scmToolMarkdown("validate_scm_access", result), null);
  assert.equal(
    scmToolMarkdown("validate_scm_access", "### SCM revision resolved\n"),
    null
  );
});
