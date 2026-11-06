import {
  type AnalysisJobView,
  analysisMatlabSummary,
  analysisTargets,
  shouldPoll,
} from "@/lib/code-analysis";
import {
  analysisActivity,
  preparationProgress,
} from "@/lib/code-analysis-progress";

export function CodeAnalysisJobDetails({
  job,
  now,
}: {
  job: AnalysisJobView;
  now: number;
}) {
  const preparation = preparationProgress(job);
  const activity = analysisActivity(job);
  const targets = analysisTargets(job.result);
  const matlab = analysisMatlabSummary(job.result);
  const coverage = job.result.coverage as Record<string, unknown> | undefined;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value.toLocaleString("en-US")
      : "—";
  const updated = activity?.updated_at ? Date.parse(activity.updated_at) : NaN;
  const age = Number.isFinite(updated)
    ? Math.max(0, Math.floor((now - updated) / 1000))
    : null;
  const model = job.configuration?.model;
  const engine = job.configuration?.engine ?? job.result.engine;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {preparation && (
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {count(preparation.completed_entries)} of{" "}
            {count(preparation.total_entries)} entries
          </span>
          <span>
            Target {preparation.target_index} of {preparation.target_count}
          </span>
        </div>
      )}
      {(activity || coverage) && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Model calls", activity?.model_calls],
            ["Tool calls", activity?.tool_calls ?? coverage?.tool_calls],
            [
              "Read ranges",
              activity?.read_range_count ?? coverage?.read_range_count,
            ],
            [
              "Paths searched",
              activity?.searched_path_count ?? coverage?.searched_path_count,
            ],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex flex-col gap-1"
            >
              <dt className="text-xs text-muted-foreground">{String(label)}</dt>
              <dd className="text-sm font-medium tabular-nums">
                {count(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {age !== null && shouldPoll(job.status) && (
        <p className="text-xs text-muted-foreground">
          {age < 10
            ? "Activity updated just now"
            : `Last activity ${
                age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`
              } ago`}
        </p>
      )}
      {matlab && (
        <p className="text-xs text-muted-foreground">
          MATLAB: {matlab.initializationStatus} · {matlab.modelCount} models ·{" "}
          {matlab.evidenceCount} evidence items
        </p>
      )}
      <details className="min-w-0 text-xs">
        <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Run details
        </summary>
        <dl className="mt-3 flex flex-col gap-2 text-muted-foreground [overflow-wrap:anywhere]">
          <div>
            <dt className="inline font-medium">Job: </dt>
            <dd className="inline font-mono">{job.job_id}</dd>
          </div>
          {job.operation === "analyze" &&
            (engine === "copilot" || engine === "deep_agent") && (
              <div>
                <dt className="inline font-medium">Engine: </dt>
                <dd className="inline">
                  {engine === "copilot" ? "Copilot" : "Deep Agent"}
                  {model ? ` · ${model}` : ""}
                </dd>
              </div>
            )}
          {targets.map((target) => (
            <div
              key={`${target.serverId}:${target.repository}:${target.revision}`}
            >
              <dt>
                {target.serverId}: {target.repository}
              </dt>
              <dd className="font-mono">{target.revision}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
