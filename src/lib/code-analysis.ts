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
