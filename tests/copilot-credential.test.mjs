import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as analysis from "../src/lib/code-analysis.ts";

test("enterprise hosts normalize exact tenants and reject URLs and wildcard destinations", () => {
  assert.equal(
    analysis.githubHostSchema.parse(" Acme.GHE.com "),
    "acme.ghe.com"
  );
  for (const host of [
    "*.ghe.com",
    "ghe.com",
    "acme.ghe.com.evil.test",
    "https://acme.ghe.com",
    "a.b.ghe.com",
    "acme.ghe.com:443",
  ])
    assert.equal(analysis.githubHostSchema.safeParse(host).success, false);
  const policy = analysis.copilotSettingsSchema.parse({
    allowed_github_hosts: ["acme.ghe.com"],
  });
  assert.deepEqual(policy.allowed_github_hosts, ["acme.ghe.com"]);
  assert.equal(
    analysis.copilotCredentialStatusSchema.parse({
      configured: false,
      generation: 0,
      updated_at: null,
      expires_at: null,
    }).github_host,
    "github.com"
  );
});

test("Copilot policy defaults off and rejects implicit or inconsistent models", () => {
  assert.equal(
    analysis.analysisSettingsSchema.parse({}).copilot.enabled,
    false
  );
  for (const copilot of [
    { enabled: true },
    { allowed_models: ["auto"], default_model: "auto" },
    { allowed_models: ["model-a"], default_model: "model-b" },
    { allowed_models: ["model-a", "model-a"] },
  ])
    assert.equal(
      analysis.analysisSettingsSchema.safeParse({ copilot }).success,
      false
    );
  assert.equal(
    analysis.analysisSettingsSchema.parse({
      copilot: {
        enabled: true,
        allowed_models: ["model-a"],
        default_model: "model-a",
      },
    }).copilot.max_tokens,
    100000
  );
});

test("credential responses are metadata only and CRUD never reflects rejected secrets", async () => {
  const status = {
    configured: true,
    github_host: "acme.ghe.com",
    generation: 2,
    updated_at: null,
    expires_at: null,
  };
  assert.deepEqual(
    analysis.copilotCredentialStatusSchema.parse(status),
    status
  );
  assert.throws(() =>
    analysis.copilotCredentialStatusSchema.parse({
      ...status,
      token: "private",
    })
  );
  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return new Response(JSON.stringify(status), { status: 200 });
  };
  try {
    assert.deepEqual(await analysis.getCopilotCredential(), status);
    await analysis.saveCopilotCredential({
      token: "github_pat_synthetic",
      github_host: "acme.ghe.com",
    });
    await analysis.deleteCopilotCredential();
    assert.equal(requests[0].url, "/api/code-analysis/copilot/credential");
    assert.equal(requests[0].cache, "no-store");
    assert.equal(requests[1].method, "PUT");
    assert.equal(JSON.parse(requests[1].body).token, "github_pat_synthetic");
    assert.equal(JSON.parse(requests[1].body).github_host, "acme.ghe.com");
    assert.equal(requests[2].method, "DELETE");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "github_pat_synthetic" }), {
        status: 422,
      });
    await assert.rejects(
      analysis.saveCopilotCredential({ token: "github_pat_synthetic" }),
      (error) => !error.message.includes("github_pat_")
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Copilot account quota is typed and fetched outside Deep Agents usage", async () => {
  const quota = {
    quota_type: "premium_interactions",
    entitlement_requests: 300,
    used_requests: 42,
    remaining_percentage: 86,
    reset_date: "2026-10-01T00:00:00Z",
    unlimited: false,
    exhausted: false,
    checked_at: "2026-09-14T12:00:00Z",
  };
  assert.deepEqual(analysis.copilotQuotaStatusSchema.parse(quota), quota);
  assert.equal(
    analysis.copilotQuotaStatusSchema.safeParse({
      ...quota,
      entitlement_requests: -1,
      unlimited: true,
      exhausted: true,
    }).success,
    false
  );

  const requests = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return new Response(JSON.stringify(quota), { status: 200 });
  };
  try {
    assert.deepEqual(await analysis.getCopilotQuota(), quota);
    assert.equal(requests[0].url, "/api/code-analysis/copilot/quota");
    assert.equal(requests[0].cache, "no-store");
  } finally {
    globalThis.fetch = original;
  }
});

test("readiness blockers explain personal credential remediation", () => {
  assert.match(
    analysis.analysisBlockerMessage("credential_expired"),
    /replace.*token/i
  );
  assert.match(
    analysis.analysisBlockerMessage("credential_missing"),
    /token settings/i
  );
  assert.match(
    analysis.analysisBlockerMessage("quota_exhausted"),
    /Deep Agent.*reset/i
  );
});

test("job display preserves the immutable Copilot policy snapshot", () => {
  const copilot = {
    adapter: "sdk-v1",
    model: "model-a",
    credential_generation: 2,
    github_host: "acme.ghe.com",
    max_tokens: 100000,
    max_tool_calls: 200,
    job_timeout_seconds: 1800,
    output_max_bytes: 8388608,
    report_markdown_max_bytes: 2097152,
    policy_version: "copilot-text-v1",
    usage_policy: "copilot_observed_v1",
  };
  const job = analysis.analysisJobSchema.parse({
    job_id: "job",
    operation: "analyze",
    status: "queued",
    configuration: {
      engine: "copilot",
      model: "model-a",
      native_limits: {},
      copilot,
    },
  });
  assert.deepEqual(job.configuration.copilot, copilot);
});

test("credential form starts empty, masked and unavailable until status loads", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CopilotCredentialPanel } = await import(
    "../src/app/components/CopilotCredentialPanel.tsx"
  );
  const html = renderToStaticMarkup(createElement(CopilotCredentialPanel));
  assert.match(html, /type="password"/);
  assert.match(html, /id="copilotToken"/);
  assert.match(html, /value=""/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Expiry/);
  assert.match(html, /Remove token/);
  assert.match(html, /GitHub account quota/);
  assert.match(html, /separate from Deep Agents quotas/);
  assert.match(html, /Refresh Copilot account quota/);
});

test("exhausted Copilot quota has a separate disabling status", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CopilotQuotaMeter } = await import(
    "../src/app/components/CopilotQuotaMeter.tsx"
  );
  const html = renderToStaticMarkup(
    createElement(CopilotQuotaMeter, {
      quota: {
        quota_type: "premium_interactions",
        entitlement_requests: 300,
        used_requests: 300,
        remaining_percentage: 0,
        reset_date: "2026-10-01T00:00:00Z",
        unlimited: false,
        exhausted: true,
        checked_at: "2026-09-14T12:00:00Z",
      },
      available: true,
      loading: false,
      error: "",
      onRefresh() {},
    })
  );
  assert.match(html, /0\.0% remaining/);
  assert.match(html, /Copilot code analysis is disabled/);
  assert.match(html, /300 used of 300/);
});

test("unavailable credentials never render a stale account quota", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CopilotQuotaMeter } = await import(
    "../src/app/components/CopilotQuotaMeter.tsx"
  );
  const html = renderToStaticMarkup(
    createElement(CopilotQuotaMeter, {
      quota: {
        quota_type: "premium_interactions",
        entitlement_requests: 300,
        used_requests: 10,
        remaining_percentage: 96.7,
        reset_date: "2026-10-01T00:00:00Z",
        unlimited: false,
        exhausted: false,
        checked_at: "2026-09-14T12:00:00Z",
      },
      available: false,
      loading: false,
      error: "",
      onRefresh() {},
    })
  );
  assert.doesNotMatch(html, /96\.7% remaining/);
  assert.match(html, /Save a Copilot token/);
});

test("credential changes abort and invalidate older quota reads", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/CopilotCredentialPanel.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /getCopilotQuota\(controller\.signal\)/);
  assert.match(source, /quotaRequest\.current\.controller\?\.abort\(\)/);
  assert.match(source, /quotaRequest\.current\.id === id/);
  assert.match(source, /quota=\{quotaAvailable \? quota : null\}/);
});
