import { z } from "zod";

import { apiFetch, extractErrorMessage } from "@/lib/auth";
import { saveBlob } from "@/lib/file-downloads";
import { scoreSchema, tagSchema, targetTypeSchema } from "@/lib/rl-feedback";

const DATASET_PATH = "/admin/rl-dataset";
const JSONL_TYPE = "application/x-ndjson";

export const CURATION_STATUSES = [
  "unreviewed",
  "approved",
  "excluded",
] as const;
const curationStatusSchema = z.enum(CURATION_STATUSES);

const count = z.number().int().nonnegative();
const counts = z.record(z.string(), count);
const optionalText = z.string().nullish();
const texts = z.array(z.string());

const settingsSchema = z.object({
  enabled: z.boolean(),
  source: z.enum(["database", "env", "default"]),
});

const statsSchema = z.object({
  total_sessions: count,
  total_ratings: count,
  star_histogram: z.object({
    "1": count,
    "2": count,
    "3": count,
    "4": count,
    "5": count,
  }),
  curation_counts: counts,
  target_type_counts: counts,
  top_tags: z.array(tagSchema.extend({ count })),
  graphs: counts,
  models: counts,
  compressed_bytes: count,
  uncompressed_bytes: count,
});

const summarySchema = z.object({
  session_id: z.string(),
  graph_id: z.string(),
  variant: optionalText,
  approval_mode: optionalText,
  curation_status: curationStatusSchema,
  capture_status: z.string(),
  message_count: count,
  tool_call_count: count,
  subagent_count: count,
  rating_count: count,
  avg_score: z.number().nullable(),
  min_score: scoreSchema.nullable(),
  max_score: scoreSchema.nullable(),
  models: texts,
  tags: texts,
  first_rated_at: z.string(),
  last_rated_at: z.string(),
  snapshot_updated_at: z.string(),
});

const listSchema = z.object({
  sessions: z.array(summarySchema),
  next_cursor: z.string().nullable(),
});

const modelSchema = z.object({
  provider: optionalText,
  model: optionalText,
  preset: optionalText,
  effort: optionalText,
  thinking: z.unknown().optional(),
  stop_reason: optionalText,
  usage_metadata: z.unknown().optional(),
});

const toolCallSchema = z.object({
  tool_call_id: optionalText,
  name: optionalText,
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  status: optionalText,
  truncated: z.boolean().optional(),
  original_bytes: count.nullish(),
  approval_decision: z.unknown().optional(),
  args_repaired: z.boolean().optional(),
  deduplicated: z.boolean().optional(),
});

const stepFields = z.object({
  step_index: count,
  role: z.string(),
  content: z.unknown().optional(),
  model_meta: modelSchema.nullish(),
  reasoning_summary: z.unknown().optional(),
  refusals: z.unknown().optional(),
  generated_files: z.unknown().optional(),
  sources: z.unknown().optional(),
  tool_calls: z.array(toolCallSchema).default([]),
});

const subagentFields = z.object({
  tool_call_id: z.string(),
  subagent_name: optionalText,
  subagent_step_index: count,
  task_input: z.unknown().optional(),
  final_output: z.unknown().optional(),
  status: optionalText,
  harness_config_hash: optionalText,
  model_meta: modelSchema.nullish(),
});

export type RlStep = z.infer<typeof stepFields> & {
  subagent_runs: RlSubagentRun[];
};
type RlSubagentRun = z.infer<typeof subagentFields> & { steps: RlStep[] };

const stepSchema: z.ZodType<RlStep> = stepFields.extend({
  subagent_runs: z.array(z.lazy(() => subagentSchema)).default([]),
});

const subagentSchema: z.ZodType<RlSubagentRun> = subagentFields.extend({
  steps: z.array(stepSchema).default([]),
});

const ratingSchema = z.object({
  id: z.string(),
  target_type: targetTypeSchema,
  score: scoreSchema,
  tags: texts,
  step_index: count,
  subagent_step_index: count.nullish(),
  subagent_name: optionalText,
  model_name: optionalText,
  model_provider: optionalText,
  created_at: z.string(),
  updated_at: z.string(),
  tag_metadata: z.array(tagSchema),
});

const sessionSchema = summarySchema.extend({
  schema_version: count,
  capture_warnings: texts,
  trajectory: z.object({
    steps: z.array(stepSchema),
    compaction_events: z.array(z.unknown()).default([]),
    rubric_evaluations: z.array(z.unknown()).default([]),
    task_outcome: z.unknown().optional(),
  }),
  harness_configs: z.record(
    z.string(),
    z.object({
      graph_id: optionalText,
      agent_name: optionalText,
      app_version: optionalText,
      sanitized_system_prompt: optionalText,
      tool_schemas: z.unknown().optional(),
      system_skills: z.unknown().optional(),
    })
  ),
  ratings: z.array(ratingSchema),
  root_harness_hash: optionalText,
});

const purgeResultSchema = z.object({
  deleted_sessions: count,
  deleted_ratings: count,
});

export type RlCurationStatus = z.infer<typeof curationStatusSchema>;
export type RlDatasetSettings = z.infer<typeof settingsSchema>;
export type RlDatasetStats = z.infer<typeof statsSchema>;
export type RlSessionSummary = z.infer<typeof summarySchema>;
export type RlSession = z.infer<typeof sessionSchema>;
export type RlDatasetList = z.infer<typeof listSchema>;
export type RlRating = z.infer<typeof ratingSchema>;
export type RlExportFormat = "canonical_thread" | "rl_samples";

export interface RlDatasetFilters {
  curation_status?: RlCurationStatus | "approved,unreviewed";
  min_score?: number;
  max_score?: number;
  target_type?: z.infer<typeof targetTypeSchema>;
  domain?: string;
  tag?: string;
  graph_id?: string;
  model?: string;
  date_from?: string;
  date_to?: string;
}

export interface RlPurgeFilters {
  older_than_days?: number;
  curation_status?: RlCurationStatus;
}

/** The download scope and list filters both constrain the exported rows. */
export function rlExportFilters(
  filters: RlDatasetFilters,
  approvedOnly: boolean
): RlDatasetFilters | null {
  const scope = approvedOnly ? "approved" : "approved,unreviewed";
  const status = filters.curation_status;
  if (status === "excluded" || (approvedOnly && status === "unreviewed"))
    return null;
  return {
    ...filters,
    curation_status:
      !status || status === "approved,unreviewed" ? scope : status,
  };
}

const PRIVATE_FIELDS = new Set([
  "userid",
  "username",
  "email",
  "displayname",
  "jobtitle",
  "threadid",
  "graphuserid",
  "graphusername",
  "graphuseremail",
  "graphuserjobtitle",
  "selfuserid",
  "userproxyurl",
  "memoryscopes",
  "rootfolderid",
  "inboxfolderid",
  "emailfoldersmap",
  "vsdateammapping",
]);

/** Render server-scrubbed dynamic payloads as text and omit private field names. */
export function rlPreviewText(value: unknown): string {
  if (typeof value === "string") return value;
  return (
    JSON.stringify(
      value,
      (key, item: unknown) =>
        PRIVATE_FIELDS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())
          ? undefined
          : item,
      2
    ) ?? ""
  );
}

function datasetQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "")
      query.set(key, String(value));
  }
  return query.toString();
}

async function requireOk(
  response: Response,
  fallback: string
): Promise<Response> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      extractErrorMessage(
        data?.detail,
        `${fallback} (HTTP ${response.status}).`
      )
    );
  }
  return response;
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fallback: string,
  options?: RequestInit
): Promise<T> {
  const response = await requireOk(
    await apiFetch(`${DATASET_PATH}${path}`, options),
    fallback
  );
  const result = schema.safeParse(await response.json().catch(() => null));
  if (!result.success)
    throw new Error(`${fallback}. The response format was unexpected.`);
  return result.data;
}

export function apiGetRlDatasetSettings(signal?: AbortSignal) {
  return requestJson(
    "/settings",
    settingsSchema,
    "Could not load collection settings",
    { signal }
  );
}

export function apiSetRlDatasetSettings(enabled: boolean) {
  return requestJson(
    "/settings",
    settingsSchema,
    "Could not update collection settings",
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }
  );
}

export function apiGetRlDatasetStats(signal?: AbortSignal) {
  return requestJson(
    "/stats",
    statsSchema,
    "Could not load dataset statistics",
    { signal }
  );
}

export function apiListRlSessions(
  filters: RlDatasetFilters,
  cursor?: string | null,
  signal?: AbortSignal
) {
  const query = datasetQuery({ ...filters, cursor, limit: 20 });
  return requestJson(
    `/sessions?${query}`,
    listSchema,
    "Could not load sessions",
    { signal }
  );
}

function sessionPath(sessionId: string) {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

export function apiGetRlSession(sessionId: string, signal?: AbortSignal) {
  return requestJson(
    sessionPath(sessionId),
    sessionSchema,
    "Could not load the trajectory",
    { signal }
  );
}

export function apiCurateRlSession(
  sessionId: string,
  curationStatus: RlCurationStatus
) {
  return requestJson(
    sessionPath(sessionId),
    summarySchema,
    "Could not update curation status",
    {
      method: "PATCH",
      body: JSON.stringify({ curation_status: curationStatus }),
    }
  );
}

export async function apiDeleteRlSession(sessionId: string): Promise<void> {
  await requireOk(
    await apiFetch(`${DATASET_PATH}${sessionPath(sessionId)}`, {
      method: "DELETE",
    }),
    "Could not delete the session"
  );
}

export function apiPurgeRlSessions(filters: RlPurgeFilters) {
  return requestJson("/purge", purgeResultSchema, "Could not purge sessions", {
    method: "POST",
    body: JSON.stringify(filters),
  });
}

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
    createWritable: () => Promise<WritableStream<Uint8Array>>;
  }>;
};

/** Send the JWT in the request header and stream to disk where supported. */
export async function downloadRlDataset(
  format: RlExportFormat,
  filters: RlDatasetFilters
): Promise<void> {
  const filename = `${format}.jsonl`;
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  const handle = await picker
    ?.call(window, { suggestedName: filename })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "SecurityError")
        return undefined;
      throw error;
    });
  const response = await requireOk(
    await apiFetch(
      `${DATASET_PATH}/export?${datasetQuery({ ...filters, format })}`,
      {
        headers: { Accept: JSONL_TYPE },
      }
    ),
    "Could not download the dataset"
  );
  if (
    response.headers.get("Content-Type")?.split(";", 1)[0]?.toLowerCase() !==
    JSONL_TYPE
  ) {
    await response.body?.cancel();
    throw new Error(
      "Could not download the dataset. The server did not return JSONL."
    );
  }
  if (handle && response.body) {
    await response.body.pipeTo(await handle.createWritable());
  } else {
    saveBlob(await response.blob(), filename);
  }
}
