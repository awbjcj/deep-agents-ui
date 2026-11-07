import { makePolicyFixture } from "./tool-permissions-browser.test.mjs";
import { DEFAULT_SKILL_LIMITS } from "../src/lib/skill-drafts.ts";
import { SOURCE_IMAGE_SOURCES } from "../src/lib/source-images.ts";

/** Mock-only account data for the real exported settings and chat surfaces. */
export function settingsReviewFixture() {
  const fallback = makePolicyFixture();
  const selected = {
    provider: "openai",
    model: "gpt-5",
    effort: "medium",
    thinking: null,
    max_tokens: 8192,
  };
  const models = [
    {
      ...selected,
      supports_effort: true,
      efforts: ["low", "medium", "high"],
      supports_thinking: false,
      thinking_required: false,
    },
  ];
  let model = { ...selected, preset: "balanced", effective: selected };
  let connection = {
    run_mode: "gateway",
    run_mode_source: "admin",
    default_run_mode: "gateway",
    proxy_url: "http://localhost:4141",
    proxy_url_source: "env",
    available_modes: ["remote", "gateway", "proxy"],
    attachments_enabled: true,
    proxy_attachments_enabled: true,
  };
  let tokens = {
    graph_api_token_preview: "••••abcd",
    jira_api_token_preview: "••••efgh",
  };
  const tiers = Object.fromEntries(
    ["user", "developer", "admin"].map((tier) => [
      tier,
      models.map(({ provider, model }) => ({ provider, model })),
    ])
  );
  const source = {
    enabled: true,
    documents_enabled: true,
    default_scope: "embedded",
    allow_all: true,
    effective_enabled: true,
  };
  const sources = Object.fromEntries(
    SOURCE_IMAGE_SOURCES.map((id) => [id, source])
  );
  const urls = Object.fromEntries(
    ["openai", "claude", "google", "xai"].flatMap((provider) =>
      ["", "_gateway", "_proxy"].map((suffix) => [
        `${provider}_base_url${suffix}`,
        {
          value: `https://${provider}.example.test/v1`,
          source: "env",
          updated_at: null,
          updated_by: null,
        },
      ])
    )
  );
  let shared = {
    urls,
    tokens: {},
    embedding_provider: "native",
    proxy_attachments_enabled: true,
  };
  const usage = {
    used: 12000,
    limit: 100000,
    pct: 12,
    is_unlimited: false,
    cycle_resets_at: null,
    display_reset: "6 days",
    calls_used: 4,
    calls_limit: 100,
    calls_pct: 4,
    calls_is_unlimited: false,
    cost_used_micros: 100000,
    cost_limit_micros: 10000000,
    cost_used_usd: 0.1,
    cost_limit_usd: 10,
    cost_pct: 1,
    cost_is_unlimited: false,
    enforced: "tokens",
  };
  const scope = {
    scope_type: "project",
    scope_id: "REVIEW",
    display_name: "Review project",
    aliases: [],
    default_access: "tier",
    member_count: 1,
  };
  const writes = [];
  const fixture = {
    writes,
    failTokens: false,
    failModels: false,
    failProfile: false,
    async route(route, account) {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const payload = method === "GET" ? null : request.postDataJSON();
      const json = (body, status = 200) =>
        route.fulfill({ json: body, status });
      if (method !== "GET") writes.push({ path, method, payload });
      if (path === "/api/user/profile" && method === "PUT") {
        if (fixture.failProfile)
          return json({ detail: "Current password is incorrect." }, 400);
        if (payload.username) account.username = payload.username;
        return json({
          ...account,
          email: "review@example.test",
          can_use_task_agent: account.role !== "user",
          can_use_code_analyzer: account.role !== "user",
          access_token: "e30.eyJleHAiOjQxMDI0NDQ4MDB9.sig",
        });
      }
      if (path.endsWith("/assistants/search"))
        return json([
          {
            assistant_id: "mock-graph",
            graph_id: "VSDA Deep Agent",
            name: "VSDA Deep Agent",
            metadata: { created_by: "system" },
            config: {},
            context: {},
            version: 1,
            created_at: "2026-11-07T00:00:00Z",
            updated_at: "2026-11-07T00:00:00Z",
          },
        ]);
      if (
        path.endsWith("/threads/search") ||
        path.endsWith("/runs") ||
        path.endsWith("/response-jobs")
      )
        return json([]);
      if (path === "/api/user/allowed-models") return json({ models });
      if (path === "/api/user/model") {
        if (fixture.failModels)
          return json(
            { detail: "Model settings are temporarily unavailable." },
            503
          );
        if (payload)
          model = {
            ...model,
            ...payload,
            effective: { ...selected, ...payload },
          };
        return json(model);
      }
      if (path === "/api/user/token-usage") return json(usage);
      if (path === "/api/user/connectivity") {
        if (payload) connection = { ...connection, ...payload };
        return json(connection);
      }
      if (path === "/api/user/image-fetching")
        return json({ enabled: true, effective: true, sources });
      if (path === "/api/user/tokens") {
        if (fixture.failTokens)
          return json(
            { detail: "Token settings are temporarily unavailable." },
            503
          );
        if (payload)
          tokens = {
            ...tokens,
            ...Object.fromEntries(
              Object.entries(payload).map(([key]) => [
                `${key}_preview`,
                "••••updated",
              ])
            ),
          };
        return json(tokens);
      }
      if (path.endsWith("/scm/servers")) return json([]);
      if (path === "/api/skills")
        return json({
          entries: [],
          library_revision: 0,
          system_revision: "review",
          limits: DEFAULT_SKILL_LIMITS,
        });
      if (path === "/api/chat-channels")
        return json({
          binding: null,
          channels: ["teams", "slack", "telegram"].map((id) => ({
            id,
            name: id[0].toUpperCase() + id.slice(1),
            available: true,
            linked: false,
            linked_account: null,
            bot_url: null,
            review_controls: "reply",
            missing_settings: [],
          })),
        });
      if (path === "/api/scheduled-tasks")
        return json({ items: [], next_offset: null, scheduler_enabled: true });
      if (path === "/api/code-analysis/engines")
        return json({
          default_engine: "deep_agent",
          engines: [
            {
              id: "deep_agent",
              label: "Deep Agent",
              ready: true,
              blockers: [],
            },
            {
              id: "copilot",
              label: "Copilot",
              ready: false,
              blockers: ["not_configured"],
            },
          ],
        });
      if (path === "/api/code-analysis/copilot/credential")
        return json({
          configured: false,
          github_host: "github.com",
          generation: 0,
          updated_at: null,
          expires_at: null,
        });
      if (path.startsWith("/api/admin/tier-models/")) {
        const tier = path.split("/").at(-1);
        return json({ tier, models: tiers[tier] });
      }
      if (path === "/api/admin/tier-models") {
        Object.assign(tiers, payload);
        return json(tiers);
      }
      if (/\/tier-(token|call|cost)-limits\//.test(path))
        return json({
          tier: path.split("/").at(-1),
          weekly_limit: 100000,
          weekly_limit_micros: 10000000,
        });
      if (path === "/api/admin/weekly-limit-settings")
        return json({
          token_enabled: true,
          call_enabled: false,
          cost_enabled: false,
        });
      if (path === "/api/admin/scopes") return json([scope]);
      if (path.endsWith("/members"))
        return json([{ username: "review-member", access: "read" }]);
      if (path === "/api/admin/broadcasts") return json({ broadcasts: [] });
      if (path === "/api/admin/run-mode")
        return json({
          run_mode: "gateway",
          run_mode_updated_at: "2026-11-07T00:00:00Z",
          run_mode_time_gap: "today",
        });
      if (path === "/api/admin/connectivity") {
        if (payload)
          shared = {
            ...shared,
            ...payload,
            urls: {
              ...shared.urls,
              ...Object.fromEntries(
                Object.entries(payload)
                  .filter(([key]) => key.includes("base_url"))
                  .map(([key, value]) => [key, { value, source: "admin" }])
              ),
            },
          };
        return json(shared);
      }
      if (path.includes("/tier-source-images/"))
        return json({
          ...source,
          tier: path.split("/").at(-2),
          source: path.split("/").at(-1),
        });
      if (path === "/api/library/indices") return json({ indices: [] });
      if (path === "/api/library/shelves") return json({ shelves: [] });
      if (path === "/api/library/shelves/audit")
        return json({ shelves: [], drift: [] });
      if (path === "/api/library/jobs") return json({ jobs: [] });
      if (path === "/api/library/batches") return json({ batches: [] });
      if (path === "/api/auth/registration-policy")
        return json({ require_invitation_code: true });
      return fallback.route(route, account);
    },
  };
  return fixture;
}
