import { z } from "zod";
import { type AnalysisJobView, shouldPoll } from "./code-analysis";

const count = z.number().int().nonnegative().max(1_000_000_000);
const preparationSchema = z
  .object({
    completed_entries: count,
    total_entries: count,
    target_index: count,
    target_count: count,
  })
  .refine(
    (value) =>
      value.completed_entries <= value.total_entries &&
      value.target_index <= value.target_count
  );
const activitySchema = z.object({
  model_calls: count.optional(),
  tool_calls: count.optional(),
  read_range_count: count.optional(),
  searched_path_count: count.optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

export function preparationProgress(job: AnalysisJobView) {
  const parsed = preparationSchema.safeParse(job.result.preparation);
  return parsed.success ? parsed.data : null;
}

export function analysisActivity(job: AnalysisJobView) {
  const parsed = activitySchema.safeParse(job.result.activity);
  return parsed.success ? parsed.data : null;
}

const phases: Record<string, [string, string]> = {
  checking_source_access: [
    "Checking source access",
    "Verifying access to the selected source revisions.",
  ],
  preparing_cached_source: [
    "Checking prepared source",
    "Looking for a reusable source snapshot.",
  ],
  source_cache_hit: [
    "Source snapshot ready",
    "Reusing a verified snapshot of the selected revision.",
  ],
  queued: [
    "Waiting for an available worker",
    "This job will start when capacity becomes available.",
  ],
  waiting_for_capacity: [
    "Waiting for an available worker",
    "This job will start when capacity becomes available.",
  ],
  fetching_source: [
    "Fetching source",
    "Retrieving the selected immutable revision.",
  ],
  fetching_targets: [
    "Fetching source",
    "Retrieving the selected immutable revisions.",
  ],
  materializing_source: [
    "Preparing source files",
    "Checking and copying repository entries into the analysis workspace.",
  ],
  building_analysis_view: [
    "Preparing evidence",
    "Building the source inventory that the analysis engine can inspect.",
  ],
  starting_analysis: [
    "Starting analysis",
    "Connecting to the selected analysis engine.",
  ],
  analyzing: [
    "Analyzing source",
    "Reviewing the selected source and collecting evidence.",
  ],
  waiting_for_model: [
    "Waiting for model response",
    "The model is reviewing the evidence. Duration depends on the request and model.",
  ],
  browsing_source: [
    "Browsing source",
    "Locating files in the selected source.",
  ],
  searching_source: [
    "Searching source",
    "Finding relevant files and source references.",
  ],
  reading_source: [
    "Reading source",
    "Inspecting source to support the analysis.",
  ],
  validating_report: [
    "Checking the report",
    "Validating findings and their source citations.",
  ],
  cleaning_up_analysis: [
    "Finishing analysis",
    "Closing the analysis session before publishing the result.",
  ],
  discovering_dependencies: [
    "Finding model dependencies",
    "Resolving the selected model's dependencies.",
  ],
  waiting_for_matlab: [
    "Waiting for MATLAB",
    "The job will continue when a MATLAB session is available.",
  ],
  initializing_matlab: [
    "Starting MATLAB",
    "Initializing the model inspection session.",
  ],
  inspecting_models: [
    "Inspecting models",
    "Collecting MATLAB and Simulink evidence.",
  ],
  validating_evidence: [
    "Validating model evidence",
    "Checking the captured model evidence.",
  ],
  cleaning_up_matlab: [
    "Closing MATLAB",
    "Releasing the model inspection session.",
  ],
};

export function analysisPhase(job: AnalysisJobView): [string, string] {
  if (job.status === "cancel_requested")
    return [
      "Stopping analysis",
      "Cancellation was requested. Waiting for current work and cleanup to finish.",
    ];
  if (job.status === "failed" || job.status === "interrupted")
    return [
      job.operation === "prepare" ? "Preparation failed" : "Analysis stopped",
      job.operation === "prepare"
        ? "Analysis has not started. Source preparation could not complete."
        : "The run stopped before completion. Any available partial report is retained.",
    ];
  if (job.status === "cancelled")
    return [
      "Work stopped",
      "The job was cancelled. Any available partial report is retained.",
    ];
  if (job.status === "succeeded")
    return [
      job.operation === "prepare" ? "Source ready" : "Report ready",
      job.operation === "prepare"
        ? "The workspace is ready for analysis."
        : "The run has completed.",
    ];
  return (
    phases[job.phase] ??
    (job.operation === "prepare"
      ? [
          "Preparing source",
          "Preparing the repository before analysis can start.",
        ]
      : [
          "Analysis in progress",
          "Waiting for the next activity update from the worker.",
        ])
  );
}

/** Only measured preparation stages have a useful percentage. */
export function analysisPercentage(job: AnalysisJobView): number | null {
  if (job.status === "succeeded") return 100;
  return job.operation === "prepare" &&
    job.progress > 0 &&
    !["queued", "running", "fetching_source"].includes(job.phase)
    ? job.progress
    : null;
}

export function analysisElapsed(
  job: AnalysisJobView,
  now: number
): string | null {
  const start = Date.parse(job.started_at ?? job.created_at ?? "");
  const end = shouldPoll(job.status) ? now : Date.parse(job.finished_at ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor(
      (seconds % 3600) / 60
    )}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}
