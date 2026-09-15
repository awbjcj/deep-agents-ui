import { z } from "zod";

import { apiFetch, extractErrorMessage } from "@/lib/auth";

const GIB = 1024 ** 3;
const ANALYSIS_POLL_BASE_MS = 2_000;
const ANALYSIS_POLL_MAX_MS = 30_000;

export const analysisLimitsSchema = z
  .object({
    list_default: z.number().int().min(1).max(200).default(50),
    list_max: z.number().int().min(1).max(200).default(200),
    cursor_ttl_seconds: z
      .number()
      .int()
      .positive()
      .default(30 * 60),
    workspace_idle_ttl_seconds: z
      .number()
      .int()
      .positive()
      .default(30 * 60),
    workspace_max_lifetime_seconds: z
      .number()
      .int()
      .positive()
      .default(24 * 60 * 60),
    sweep_interval_seconds: z.number().int().positive().default(60),
    session_max_bytes: z
      .number()
      .int()
      .positive()
      .default(20 * GIB),
    worker_max_bytes: z
      .number()
      .int()
      .positive()
      .default(100 * GIB),
    max_worker_jobs: z.number().int().positive().default(2),
    max_active_jobs_per_session: z.number().int().positive().default(1),
    max_queued_jobs: z.number().int().min(0).default(20),
    job_timeout_seconds: z
      .number()
      .int()
      .positive()
      .default(30 * 60),
    heartbeat_seconds: z.number().int().positive().default(10),
    heartbeat_loss_seconds: z.number().int().positive().default(60),
    output_max_bytes: z
      .number()
      .int()
      .positive()
      .default(8 * 1024 * 1024),
    report_markdown_max_bytes: z
      .number()
      .int()
      .positive()
      .default(2 * 1024 * 1024),
    max_public_wait_seconds: z.literal(20).default(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.list_default > value.list_max) {
      ctx.addIssue({
        code: "custom",
        path: ["list_default"],
        message: "Must not exceed list_max",
      });
    }
    if (value.worker_max_bytes < value.session_max_bytes) {
      ctx.addIssue({
        code: "custom",
        path: ["worker_max_bytes"],
        message: "Must cover one session",
      });
    }
    if (value.heartbeat_loss_seconds < value.heartbeat_seconds) {
      ctx.addIssue({
        code: "custom",
        path: ["heartbeat_loss_seconds"],
        message: "Must cover one heartbeat",
      });
    }
    if (
      value.workspace_max_lifetime_seconds < value.workspace_idle_ttl_seconds
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["workspace_max_lifetime_seconds"],
        message: "Must cover idle lifetime",
      });
    }
  });

export type AnalysisLimits = z.infer<typeof analysisLimitsSchema>;

export const engineIdSchema = z.enum(["deep_agent", "copilot"]);
export type AnalysisEngine = z.infer<typeof engineIdSchema>;

export const nativeAnalysisLimitsSchema = z
  .object({
    max_tokens: z.number().int().positive().default(100_000),
    max_tool_calls: z.number().int().positive().default(200),
  })
  .strict();

export const matlabLimitsSchema = z
  .object({
    concurrent_processes: z.literal(1).default(1),
    startup_timeout_seconds: z.number().int().positive().default(600),
    operation_timeout_seconds: z.number().int().positive().default(300),
    max_dependency_depth: z.number().int().min(0).default(8),
    max_dependency_repositories: z.number().int().min(0).default(10),
    max_artifacts: z.number().int().positive().default(50_000),
    max_artifact_bytes: z
      .number()
      .int()
      .positive()
      .default(256 * 1024 ** 2),
    max_download_bytes: z
      .number()
      .int()
      .positive()
      .default(10 * 1024 ** 3),
    max_archive_bytes: z
      .number()
      .int()
      .positive()
      .default(512 * 1024 ** 2),
    max_dependency_restarts: z.number().int().min(0).default(2),
  })
  .strict();

export const matlabSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    dependency_server_ids: z
      .array(z.string().trim().min(1).max(256))
      .default([])
      .refine((values) => new Set(values).size === values.length, {
        message: "Dependency server IDs must be unique",
      }),
    limits: matlabLimitsSchema.prefault({}),
  })
  .strict();
export type MatlabSettings = z.infer<typeof matlabSettingsSchema>;

export const matlabReadinessSchema = z
  .object({
    configured: z.boolean(),
    runtime_ready: z.boolean(),
    toolkit_schemas_ready: z.boolean(),
    skills_ready: z.boolean(),
    initialization_ready: z.boolean(),
    isolation_ready: z.boolean(),
    broker_ready: z.boolean(),
    gerrit_ready: z.boolean(),
    plastic_ready: z.boolean(),
    probe_fresh: z.boolean(),
    verified_at: z.string().nullable().default(null),
    configuration_digest: z.string().nullable().default(null),
    blockers: z.array(z.string()).default([]),
    ready: z.boolean(),
  })
  .strict();

const exactCopilotModel = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => value === value.trim() && value.toLowerCase() !== "auto",
    "Enter an exact model ID"
  );

export const githubHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(github\.com|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ghe\.com)$/,
    "Use github.com or an exact tenant.ghe.com hostname"
  );

export const copilotSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    allowed_models: z.array(exactCopilotModel).default([]),
    allowed_github_hosts: z.array(githubHostSchema).default(["github.com"]),
    default_model: exactCopilotModel.nullable().default(null),
    max_tokens: z.number().int().positive().default(100000),
    max_tool_calls: z.number().int().positive().default(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.allowed_models).size !== value.allowed_models.length)
      context.addIssue({
        code: "custom",
        path: ["allowed_models"],
        message: "Allowed models must be unique",
      });
    if (
      (value.enabled && !value.default_model) ||
      (value.default_model &&
        !value.allowed_models.includes(value.default_model))
    )
      context.addIssue({
        code: "custom",
        path: ["default_model"],
        message: "Choose an allowed default model before enabling Copilot",
      });
  });

export const copilotCredentialStatusSchema = z
  .object({
    configured: z.boolean(),
    github_host: githubHostSchema.default("github.com"),
    generation: z.number().int().nonnegative(),
    updated_at: z.string().nullable(),
    expires_at: z.string().nullable(),
  })
  .strict();
export type CopilotCredentialStatus = z.infer<
  typeof copilotCredentialStatusSchema
>;

export const copilotQuotaStatusSchema = z
  .object({
    quota_type: z.literal("premium_interactions"),
    entitlement_requests: z.number().int().min(-1),
    used_requests: z.number().int().nonnegative(),
    remaining_percentage: z.number().min(0).max(100),
    reset_date: z.string().nullable(),
    unlimited: z.boolean(),
    exhausted: z.boolean(),
    checked_at: z.string().datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.unlimited && value.exhausted)
      context.addIssue({
        code: "custom",
        path: ["exhausted"],
        message: "Unlimited quota cannot be exhausted",
      });
  });
export type CopilotQuotaStatus = z.infer<typeof copilotQuotaStatusSchema>;

export const COPILOT_USAGE_EXPLANATION =
  "Copilot premium interactions are billed through your GitHub account and are separate from Deep Agents token, call, and cost quotas. Copilot analysis is disabled when this account quota is reached.";

/** Explain safe blocker codes without exposing private runtime configuration. */
export function analysisBlockerMessage(code: string): string {
  const messages: Record<string, string> = {
    credential_missing: "Add your Copilot token in Token settings.",
    github_host_not_allowed:
      "Ask an administrator to allow your GitHub account hostname.",
    github_host_unverified:
      "An administrator must verify Copilot for your GitHub account hostname.",
    credential_expired: "Replace your expired Copilot token in Token settings.",
    disabled: "An administrator must enable Copilot analysis.",
    sdk_runtime:
      "Ask an administrator to configure Copilot on the analysis worker.",
    behavior_probe: "An administrator must verify Copilot before it can run.",
    cleanup: "The analysis worker needs cleanup before Copilot can run.",
    access_service: "Copilot authorization is temporarily unavailable.",
    quota_exhausted:
      "Your Copilot premium interaction quota is reached. Use Deep Agent or wait for the account reset.",
    quota_unavailable:
      "Copilot quota could not be verified. Refresh your account status before using Copilot analysis.",
    worker_unavailable: "The analysis worker is unavailable.",
  };
  return messages[code] ?? code.replaceAll("_", " ");
}

async function copilotCredentialRequest(
  options: RequestInit = {}
): Promise<CopilotCredentialStatus> {
  const response = await apiFetch("/code-analysis/copilot/credential", {
    ...options,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sign in again to manage your Copilot token."
        : response.status === 400 || response.status === 422
        ? "Enter a fine-grained token and a future expiry time."
        : "Could not update Copilot token settings. Try again."
    );
  return copilotCredentialStatusSchema.parse(await response.json());
}

export function getCopilotCredential(): Promise<CopilotCredentialStatus> {
  return copilotCredentialRequest();
}

export function saveCopilotCredential(input: {
  token: string;
  github_host?: string;
  expires_at?: string | null;
}): Promise<CopilotCredentialStatus> {
  return copilotCredentialRequest({
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteCopilotCredential(): Promise<CopilotCredentialStatus> {
  return copilotCredentialRequest({ method: "DELETE" });
}

export async function getCopilotQuota(
  signal?: AbortSignal
): Promise<CopilotQuotaStatus> {
  const data = await responseJson(
    await apiFetch("/code-analysis/copilot/quota", {
      cache: "no-store",
      signal,
    }),
    "Could not load Copilot account quota"
  );
  return copilotQuotaStatusSchema.parse(data);
}

export const analysisSettingsSchema = z
  .object({
    limits: analysisLimitsSchema.prefault({}),
    native_limits: nativeAnalysisLimitsSchema.prefault({}),
    default_engine: engineIdSchema.default("copilot"),
    model_override: z
      .object({ provider: z.string().min(1), model: z.string().min(1) })
      .strict()
      .nullable()
      .default(null),
    matlab: matlabSettingsSchema.prefault({}),
    copilot: copilotSettingsSchema.prefault({}),
  })
  .strict();
export type AnalysisSettings = z.infer<typeof analysisSettingsSchema>;

export const engineCatalogSchema = z
  .object({
    default_engine: engineIdSchema,
    engines: z.array(
      z
        .object({
          id: engineIdSchema,
          ready: z.boolean(),
          blockers: z.array(z.string()).default([]),
          matlab: matlabReadinessSchema.optional(),
          quota: copilotQuotaStatusSchema.optional(),
        })
        .strict()
    ),
  })
  .strict();
export type EngineCatalog = z.infer<typeof engineCatalogSchema>;

const analysisResultSchema = z.record(z.string(), z.unknown()).default({});

export const analysisJobSchema = z.object({
  job_id: z.string().min(1),
  status: z.string(),
  phase: z.string().default("queued"),
  progress: z.number().int().min(0).max(100).default(0),
  result: analysisResultSchema,
  report_id: z.string().nullable().optional().default(null),
  error_code: z.string().nullable().optional().default(null),
  error_message: z.string().nullable().optional().default(null),
  completeness: z.string().optional(),
  operation: z.string().optional(),
  created_at: z.string().optional(),
  finished_at: z.string().nullable().optional(),
  configuration: z
    .object({
      engine: engineIdSchema,
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      native_limits: nativeAnalysisLimitsSchema,
      copilot: z
        .object({
          adapter: z.literal("sdk-v1"),
          model: exactCopilotModel,
          credential_generation: z.number().int().positive(),
          github_host: githubHostSchema.default("github.com"),
          max_tokens: z.number().int().positive(),
          max_tool_calls: z.number().int().positive(),
          job_timeout_seconds: z.number().int().positive(),
          output_max_bytes: z.number().int().positive(),
          report_markdown_max_bytes: z.number().int().positive(),
          policy_version: z.literal("copilot-text-v1"),
          usage_policy: z.literal("copilot_observed_v1"),
        })
        .strict()
        .nullable()
        .optional(),
      matlab: z
        .object({
          limits: matlabLimitsSchema,
          dependency_server_ids: z.array(z.string()),
          capability_version: z.literal("matlab-analysis-v1"),
        })
        .strict()
        .nullable()
        .optional(),
    })
    .optional(),
});

export type AnalysisJobView = z.infer<typeof analysisJobSchema>;

export type AnalysisTarget = {
  serverId: string;
  repository: string;
  revision: string;
};

/** Extract only display-safe immutable identities from a worker-owned result. */
export function analysisTargets(
  result: Record<string, unknown>
): AnalysisTarget[] {
  const candidates = Array.isArray(result.targets)
    ? result.targets
    : Array.isArray(result.target_manifest)
    ? result.target_manifest
    : [];
  return candidates.slice(0, 20).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const value = candidate as {
      server_id?: unknown;
      repository?: unknown;
      revision?: unknown;
    };
    return typeof value.server_id === "string" &&
      typeof value.repository === "string" &&
      typeof value.revision === "string" &&
      value.server_id.length <= 120 &&
      value.repository.length <= 200 &&
      value.revision.length <= 200
      ? [
          {
            serverId: value.server_id,
            repository: value.repository,
            revision: value.revision,
          },
        ]
      : [];
  });
}

/** Return explicit worker warnings without reflecting arbitrary result content. */
export function analysisWarnings(result: Record<string, unknown>): string[] {
  const warnings = result.warnings;
  return Array.isArray(warnings)
    ? warnings
        .filter(
          (warning): warning is string =>
            typeof warning === "string" && warning.length <= 500
        )
        .slice(0, 20)
    : [];
}

export type AnalysisMatlabSummary = {
  initializationStatus: string;
  artifactCount: number;
  modelCount: number;
  evidenceCount: number;
};

/** Project only bounded model-evidence state from the durable job summary. */
export function analysisMatlabSummary(
  result: Record<string, unknown>
): AnalysisMatlabSummary | null {
  const matlab = result.matlab;
  if (!matlab || typeof matlab !== "object") return null;
  const section = matlab as {
    initialization_status?: unknown;
    summary?: unknown;
  };
  if (typeof section.initialization_status !== "string") return null;
  const counts =
    section.summary && typeof section.summary === "object"
      ? (section.summary as Record<string, unknown>)
      : {};
  const count = (name: string) => {
    const value = counts[name];
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? value
      : 0;
  };
  return {
    initializationStatus: section.initialization_status,
    artifactCount: count("artifact_count"),
    modelCount: count("model_count"),
    evidenceCount: count("evidence_count"),
  };
}

async function responseJson(res: Response, fallback: string): Promise<unknown> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      data && typeof data === "object"
        ? (data as { detail?: unknown }).detail
        : null;
    throw new Error(extractErrorMessage(detail, fallback));
  }
  return data;
}

/** Keep polling until the worker has reached a state that can no longer change. */
export function shouldPoll(status: string): boolean {
  return !new Set(["succeeded", "failed", "cancelled", "interrupted"]).has(
    status
  );
}

/** Back off transient status failures without abandoning a durable job. */
export function analysisPollDelay(failures: number): number {
  const exponent = Number.isFinite(failures)
    ? Math.max(0, Math.min(Math.trunc(failures), 4))
    : 0;
  return Math.min(ANALYSIS_POLL_BASE_MS * 2 ** exponent, ANALYSIS_POLL_MAX_MS);
}

/** Return an inert filename instead of reflecting unsafe server IDs to downloads. */
export function reportFilename(reportId: string): string {
  return /^[A-Za-z0-9_-]+$/.test(reportId)
    ? `analysis-${reportId}.md`
    : "analysis-report.md";
}

export async function getAnalysisSettings(): Promise<AnalysisLimits> {
  const data = await responseJson(
    await apiFetch("/admin/code-analysis/settings"),
    "Failed to load code-analysis limits"
  );
  return analysisLimitsSchema.parse(data);
}

export async function saveAnalysisSettings(
  input: AnalysisLimits
): Promise<AnalysisLimits> {
  const data = await responseJson(
    await apiFetch("/admin/code-analysis/settings", {
      method: "PUT",
      body: JSON.stringify(analysisLimitsSchema.parse(input)),
    }),
    "Failed to save code-analysis limits"
  );
  return analysisLimitsSchema.parse(data);
}

export async function getAnalysisEngineSettings(): Promise<AnalysisSettings> {
  const data = await responseJson(
    await apiFetch("/admin/code-analysis/engine-settings"),
    "Failed to load analysis engine settings"
  );
  return analysisSettingsSchema.parse(data);
}

export async function saveAnalysisEngineSettings(
  input: AnalysisSettings
): Promise<AnalysisSettings> {
  const data = await responseJson(
    await apiFetch("/admin/code-analysis/engine-settings", {
      method: "PUT",
      body: JSON.stringify(analysisSettingsSchema.parse(input)),
    }),
    "Failed to save analysis engine settings"
  );
  return analysisSettingsSchema.parse(data);
}

export async function getAnalysisEngines(): Promise<EngineCatalog> {
  return engineCatalogSchema.parse(
    await responseJson(
      await apiFetch("/code-analysis/engines"),
      "Failed to load analysis engines"
    )
  );
}

export async function getAnalysisJob(
  jobId: string,
  signal?: AbortSignal
): Promise<AnalysisJobView> {
  const data = await responseJson(
    await apiFetch(`/code-analysis/jobs/${encodeURIComponent(jobId)}`, {
      signal,
    }),
    "Failed to load code-analysis job"
  );
  return analysisJobSchema.parse(data);
}

export async function cancelAnalysisJob(
  jobId: string
): Promise<AnalysisJobView> {
  const data = await responseJson(
    await apiFetch(`/code-analysis/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    }),
    "Failed to cancel code-analysis job"
  );
  return analysisJobSchema.parse(data);
}

function currentThreadId(): string {
  if (typeof window === "undefined") throw new Error("No active conversation");
  const threadId = new URLSearchParams(window.location.search)
    .get("threadId")
    ?.trim();
  if (!threadId)
    throw new Error(
      "Select a conversation before using code-analysis resources"
    );
  return threadId;
}

/** Release the current conversation's workspace without exposing a handle in UI props. */
export async function releaseCodeWorkspace(): Promise<void> {
  const res = await apiFetch("/code-analysis/workspaces/release", {
    method: "POST",
    body: JSON.stringify({ thread_id: currentThreadId() }),
  });
  if (!res.ok) await responseJson(res, "Failed to release code workspace");
}

export async function downloadAnalysisReport(reportId: string): Promise<Blob> {
  const threadId = currentThreadId();
  const res = await apiFetch(
    `/code-analysis/reports/${encodeURIComponent(
      reportId
    )}/download?thread_id=${encodeURIComponent(threadId)}`
  );
  if (!res.ok) await responseJson(res, "Failed to download analysis report");
  return res.blob();
}
