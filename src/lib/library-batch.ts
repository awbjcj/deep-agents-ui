import { z } from "zod";

import { apiFetch } from "@/lib/auth";
import { responseJson } from "@/lib/library-admin";
import { libraryJobSchema } from "@/lib/library-admin";
import type { LibraryJob } from "@/lib/library-admin";

/** Operations a batch can apply across many shelves. */
export type BatchOperation = "sync" | "rebuild" | "prune";

const batchTargetSchema = z.object({
  shelf_id: z.string(),
  index: z.string(),
  source_types: z.array(z.string()).default([]),
  has_active_job: z.boolean().default(false),
  retention_enabled: z.boolean().default(false),
});

const batchPreviewSchema = z.object({
  scope_kind: z.string().default("explicit"),
  scope_value: z.string().default(""),
  targets: z.array(batchTargetSchema).default([]),
  total: z.number().int().nonnegative().default(0),
});

const batchSkippedSchema = z.object({
  shelf_id: z.string(),
  reason: z.string().default(""),
});

const libraryBatchSchema = z.object({
  batch_id: z.string(),
  operation: z.string(),
  mode: z.string(),
  dry_run: z.boolean(),
  scope_kind: z.string().default("explicit"),
  scope_value: z.string().default(""),
  concurrency: z.number().int().positive().default(1),
  // status stays z.string() rather than an enum, matching libraryJobSchema: a
  // value added server-side must degrade to a label, not a parse failure that
  // blanks the whole panel.
  status: z.string(),
  total_jobs: z.number().int().nonnegative().default(0),
  succeeded_jobs: z.number().int().nonnegative().default(0),
  failed_jobs: z.number().int().nonnegative().default(0),
  cancelled_jobs: z.number().int().nonnegative().default(0),
  interrupted_jobs: z.number().int().nonnegative().default(0),
  created_by: z.string(),
  created_at: z.string().nullable().default(null),
  started_at: z.string().nullable().default(null),
  finished_at: z.string().nullable().default(null),
  jobs: z.array(libraryJobSchema).default([]),
  skipped: z.array(batchSkippedSchema).default([]),
});

const indexBatchResultSchema = z.object({
  index: z.string(),
  ok: z.boolean(),
  detail: z.string().default(""),
});

const indexBatchResponseSchema = z.object({
  action: z.string(),
  results: z.array(indexBatchResultSchema).default([]),
  succeeded: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
});

export type LibraryBatchTarget = z.infer<typeof batchTargetSchema>;
export type LibraryBatchPreview = z.infer<typeof batchPreviewSchema>;
export type LibraryBatch = z.infer<typeof libraryBatchSchema>;
export type LibraryBatchSkipped = z.infer<typeof batchSkippedSchema>;
export type LibraryIndexBatchResponse = z.infer<typeof indexBatchResponseSchema>;

/** A scope selector. Exactly one field may be set. */
export interface BatchScope {
  scopeIndex?: string;
  scopeSource?: string;
  scopeAll?: boolean;
}

function scopeBody(scope: BatchScope): Record<string, unknown> {
  if (scope.scopeAll) return { scope_all: true };
  if (scope.scopeIndex) return { scope_index: scope.scopeIndex };
  if (scope.scopeSource) return { scope_source: scope.scopeSource };
  return {};
}

/** Resolve a scope to its target shelves without submitting anything. */
export async function apiPreviewLibraryBatch(
  scope: BatchScope,
  signal?: AbortSignal
): Promise<LibraryBatchPreview> {
  const data = await responseJson(
    await apiFetch("/library/batches/preview", {
      method: "POST",
      body: JSON.stringify(scopeBody(scope)),
      signal,
    }),
    "Failed to preview batch targets"
  );
  return batchPreviewSchema.parse(data);
}

/**
 * Submit one operation across an explicit list of shelves.
 *
 * The panel always sends explicit ids rather than a scope, because the operator
 * refines the previewed list before confirming; sending the scope again could
 * submit a set that no longer matches what they approved.
 */
export async function apiSubmitLibraryBatch(options: {
  operation: BatchOperation;
  shelfIds: string[];
  mode?: "full" | "delta";
  dryRun?: boolean;
}): Promise<LibraryBatch> {
  const body: Record<string, unknown> = {
    operation: options.operation,
    shelf_ids: options.shelfIds,
    dry_run: options.dryRun ?? false,
  };
  if (options.operation === "sync") body.mode = options.mode ?? "full";
  const data = await responseJson(
    await apiFetch("/library/batches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    "Failed to submit batch"
  );
  return libraryBatchSchema.parse(data);
}

export async function apiGetLibraryBatch(
  batchId: string,
  signal?: AbortSignal
): Promise<LibraryBatch> {
  const data = await responseJson(
    await apiFetch(`/library/batches/${encodeURIComponent(batchId)}`, { signal }),
    "Failed to read batch status"
  );
  return libraryBatchSchema.parse(data);
}

export async function apiListActiveLibraryBatches(
  signal?: AbortSignal
): Promise<LibraryBatch[]> {
  const data = await responseJson(
    await apiFetch("/library/batches?active=true", { signal }),
    "Failed to list active batches"
  );
  return z.object({ batches: z.array(libraryBatchSchema) }).parse(data).batches;
}

/** Cancel a batch's not-yet-started jobs. Running jobs are left to finish. */
export async function apiCancelLibraryBatch(
  batchId: string
): Promise<LibraryBatch> {
  const data = await responseJson(
    await apiFetch(`/library/batches/${encodeURIComponent(batchId)}/cancel`, {
      method: "POST",
    }),
    "Failed to cancel batch"
  );
  return libraryBatchSchema.parse(data);
}

export async function apiCancelLibraryJob(jobId: string): Promise<LibraryJob> {
  const data = await responseJson(
    await apiFetch(`/library/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    }),
    "Failed to cancel job"
  );
  return libraryJobSchema.parse(data);
}

/** Delete or refresh several exact indices in one request. */
export async function apiBatchIndexMaintenance(
  action: "delete" | "refresh",
  indices: string[]
): Promise<LibraryIndexBatchResponse> {
  const data = await responseJson(
    await apiFetch("/library/indices/batch", {
      method: "POST",
      body: JSON.stringify({ action, indices }),
    }),
    `Failed to ${action} the selected indices`
  );
  return indexBatchResponseSchema.parse(data);
}
