import { z } from "zod";

import { apiFetch, extractErrorMessage } from "@/lib/auth";

const indexSummarySchema = z.object({
  name: z.string(),
  health: z.string(),
  status: z.string(),
  doc_count: z.number().int().nonnegative(),
  store_size_bytes: z.number().int().nonnegative(),
  primary_store_size_bytes: z.number().int().nonnegative(),
});

const indexDetailSchema = z.object({
  index_name: z.string(),
  document_count: z.number().int().nonnegative(),
  fields: z.record(z.string(), z.string()),
});

const shelfSchema = z.object({
  shelf_id: z.string(),
  source_type: z.string(),
  index_name: z.string(),
  description: z.string().nullable(),
  retention_enabled: z.boolean().default(false),
  retention_older_than: z.string().nullable().default(null),
  supports_files: z.boolean().default(false),
  file_count: z.number().int().nonnegative().default(0),
});

const libraryFileSchema = z.object({
  file_id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  byte_size: z.number().int().nonnegative(),
  uploaded_at: z.string(),
  uploaded_by: z.string(),
  conversion_engine: z.string().nullable().default(null),
  warning: z.string().nullable().default(null),
});

const shelfAuditSchema = z.object({
  shelf_id: z.string(),
  source_type: z.string(),
  index_exists: z.boolean(),
  // MISSING | LEGACY | MAPPING_DRIFT | MANAGED | ERROR. Kept as a string so a
  // status added server-side degrades to a label rather than a parse failure.
  status: z.string().default(""),
  error: z.string().nullable().default(null),
  is_managed: z.boolean().default(false),
  live_chunks: z.number().int().nonnegative().default(0),
  tombstoned: z.number().int().nonnegative().default(0),
  distinct_source_ids: z.number().int().nonnegative().default(0),
  oldest_source_updated: z.string().nullable().default(null),
  newest_source_updated: z.string().nullable().default(null),
  oldest_ingested: z.string().nullable().default(null),
  newest_ingested: z.string().nullable().default(null),
  at_risk_count: z.number().int().nonnegative().default(0),
  last_sync: z.record(z.string(), z.unknown()).nullable().default(null),
});

const driftReportSchema = z.object({
  shelf_id: z.string(),
  index_exists: z.boolean(),
  missing_fields: z.array(z.string()).default([]),
  knn_enabled: z.boolean().default(true),
  vector_field_ok: z.boolean().default(true),
  missing_pipelines: z.array(z.string()).default([]),
  has_drift: z.boolean(),
});

const pruneResultSchema = z.object({
  shelf_id: z.string(),
  index: z.string(),
  dry_run: z.boolean(),
  retention_enabled: z.boolean(),
  older_than: z.string().nullable(),
  at_risk: z.number().int().nonnegative(),
  tombstoned: z.number().int().nonnegative(),
});

// Exported so `library-batch.ts` can embed child jobs in a batch payload
// without redeclaring the shape and letting the two drift apart.
export const libraryJobSchema = z.object({
  job_id: z.string(),
  shelf_id: z.string(),
  operation: z.string(),
  mode: z.string(),
  dry_run: z.boolean(),
  // status and phase stay z.string() rather than enums, matching the choice
  // made for shelfAuditSchema.status above: a value added server-side must
  // degrade to a label, not a parse failure that blanks the whole panel.
  status: z.string(),
  phase: z.string(),
  extracted_records: z.number().int().nonnegative().default(0),
  upserts: z.number().int().nonnegative().default(0),
  metadata_updates: z.number().int().nonnegative().default(0),
  tombstones: z.number().int().nonnegative().default(0),
  error: z.string().nullable().default(null),
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  created_by: z.string(),
  created_at: z.string().nullable().default(null),
  started_at: z.string().nullable().default(null),
  finished_at: z.string().nullable().default(null),
});

export type LibraryJob = z.infer<typeof libraryJobSchema>;

export type LibraryIndexSummary = z.infer<typeof indexSummarySchema>;
export type LibraryIndexDetail = z.infer<typeof indexDetailSchema>;
export type LibraryShelf = z.infer<typeof shelfSchema>;
export type LibraryFile = z.infer<typeof libraryFileSchema>;
export type ShelfAudit = z.infer<typeof shelfAuditSchema>;
export type DriftReport = z.infer<typeof driftReportSchema>;
export type ShelfPruneResult = z.infer<typeof pruneResultSchema>;

export async function responseJson(
  res: Response,
  fallback: string
): Promise<unknown> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A proxy or gateway returns an HTML error page, not JSON, so `detail` is
    // absent and the caller used to see only the hardcoded fallback -- which
    // hid the difference between a real backend rejection and a timed-out hop.
    if (data === null) {
      throw new Error(`${fallback} (HTTP ${res.status} ${res.statusText})`);
    }
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(extractErrorMessage(detail, fallback));
  }
  return data ?? {};
}

export async function apiListLibraryIndices(
  pattern = "vsda_*",
  signal?: AbortSignal
): Promise<LibraryIndexSummary[]> {
  const params = new URLSearchParams({ pattern });
  const data = await responseJson(
    await apiFetch(`/library/indices?${params}`, { signal }),
    "Failed to load OpenSearch indices"
  );
  return z.object({ indices: z.array(indexSummarySchema) }).parse(data).indices;
}

export async function apiGetLibraryIndex(
  indexName: string
): Promise<LibraryIndexDetail> {
  const data = await responseJson(
    await apiFetch(`/library/indices/${encodeURIComponent(indexName)}`),
    "Failed to load index details"
  );
  return indexDetailSchema.parse(data);
}

export async function apiRefreshLibraryIndex(indexName: string): Promise<void> {
  await responseJson(
    await apiFetch(
      `/library/indices/${encodeURIComponent(indexName)}/refresh`,
      { method: "POST" }
    ),
    "Failed to refresh index"
  );
}

export async function apiDeleteLibraryIndex(
  indexName: string
): Promise<number> {
  const data = await responseJson(
    await apiFetch(`/library/indices/${encodeURIComponent(indexName)}`, {
      method: "DELETE",
    }),
    "Failed to delete index"
  );
  return z
    .object({
      deleted: z.literal(true),
      doc_count: z.number().int().nonnegative(),
    })
    .parse(data).doc_count;
}

export async function apiPruneEmptyLibraryIndices(
  pattern: string,
  dryRun: boolean
): Promise<string[]> {
  const params = new URLSearchParams({ pattern, dry_run: String(dryRun) });
  const data = await responseJson(
    await apiFetch(`/library/indices/prune-empty?${params}`, {
      method: "POST",
    }),
    "Failed to prune empty indices"
  );
  const parsed = z
    .object({ deleted: z.array(z.string()), would_delete: z.array(z.string()) })
    .parse(data);
  return dryRun ? parsed.would_delete : parsed.deleted;
}

export async function apiListLibraryShelves(
  signal?: AbortSignal
): Promise<LibraryShelf[]> {
  const data = await responseJson(
    await apiFetch("/library/shelves", { signal }),
    "Failed to load library shelves"
  );
  return z.object({ shelves: z.array(shelfSchema) }).parse(data).shelves;
}

export async function apiListLibraryShelfFiles(
  shelfId: string,
  signal?: AbortSignal
): Promise<LibraryFile[]> {
  const data = await responseJson(
    await apiFetch(`/library/shelves/${encodeURIComponent(shelfId)}/files`, {
      signal,
    }),
    "Failed to load shelf files"
  );
  return z.object({ files: z.array(libraryFileSchema) }).parse(data).files;
}

const libraryFileMutationSchema = z.object({
  files: z.array(libraryFileSchema),
  job: libraryJobSchema,
});

export async function apiUploadLibraryShelfFiles(
  shelfId: string,
  files: readonly File[]
): Promise<{ files: LibraryFile[]; job: LibraryJob }> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const data = await responseJson(
    await apiFetch(`/library/shelves/${encodeURIComponent(shelfId)}/files`, {
      method: "POST",
      body: form,
    }),
    "Failed to upload shelf files"
  );
  return libraryFileMutationSchema.parse(data);
}

export async function apiDeleteLibraryShelfFile(
  shelfId: string,
  fileId: string
): Promise<{ files: LibraryFile[]; job: LibraryJob }> {
  const data = await responseJson(
    await apiFetch(
      `/library/shelves/${encodeURIComponent(
        shelfId
      )}/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" }
    ),
    "Failed to delete shelf file"
  );
  return libraryFileMutationSchema.parse(data);
}

export async function apiAuditLibrary(signal?: AbortSignal): Promise<{
  shelves: ShelfAudit[];
  drift: DriftReport[];
}> {
  const params = new URLSearchParams({
    scope_all: "true",
    check_drift: "true",
  });
  const data = await responseJson(
    await apiFetch(`/library/shelves/audit?${params}`, { signal }),
    "Failed to audit the search library"
  );
  return z
    .object({
      shelves: z.array(shelfAuditSchema),
      drift: z.array(driftReportSchema),
    })
    .parse(data);
}

export async function apiSyncLibraryShelf(
  shelfId: string,
  options: { mode: "full" | "delta"; dryRun?: boolean }
): Promise<LibraryJob> {
  const params = new URLSearchParams({
    mode: options.mode,
    dry_run: String(options.dryRun ?? false),
  });
  const data = await responseJson(
    await apiFetch(
      `/library/shelves/${encodeURIComponent(shelfId)}/sync?${params}`,
      { method: "POST" }
    ),
    "Failed to submit shelf synchronization"
  );
  return libraryJobSchema.parse(data);
}

export async function apiRebuildLibraryShelf(
  shelfId: string
): Promise<LibraryJob> {
  const data = await responseJson(
    await apiFetch(`/library/shelves/${encodeURIComponent(shelfId)}/rebuild`, {
      method: "POST",
    }),
    "Failed to submit shelf rebuild"
  );
  return libraryJobSchema.parse(data);
}

export async function apiGetLibraryJob(
  jobId: string,
  signal?: AbortSignal
): Promise<LibraryJob> {
  const data = await responseJson(
    await apiFetch(`/library/jobs/${encodeURIComponent(jobId)}`, { signal }),
    "Failed to read library job status"
  );
  return libraryJobSchema.parse(data);
}

export async function apiListActiveLibraryJobs(
  signal?: AbortSignal
): Promise<LibraryJob[]> {
  const data = await responseJson(
    await apiFetch("/library/jobs?active=true", { signal }),
    "Failed to list active library jobs"
  );
  return z.object({ jobs: z.array(libraryJobSchema) }).parse(data).jobs;
}

export async function apiPruneLibraryShelf(
  shelfId: string,
  dryRun = false
): Promise<ShelfPruneResult> {
  const params = new URLSearchParams({ dry_run: String(dryRun) });
  const data = await responseJson(
    await apiFetch(
      `/library/shelves/${encodeURIComponent(shelfId)}/prune?${params}`,
      { method: "POST" }
    ),
    "Failed to apply shelf retention"
  );
  return pruneResultSchema.parse(data);
}
