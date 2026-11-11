import { z } from "zod";
import { apiFetch, extractErrorMessage } from "@/lib/auth";
import {
  analysisJobSchema,
  getAnalysisJob,
  shouldPoll,
  type AnalysisEngine,
  type AnalysisJobView,
} from "@/lib/code-analysis";

export const MAX_WORKSPACE_TARGETS = 20;

const refSchema = z.object({ server_id: z.string(), repository: z.string() });
export type RepositoryRef = z.infer<typeof refSchema>;

const targetSchema = z.object({
  ref: refSchema,
  provider: z.enum(["gerrit", "plastic"]),
  revision: z.string().min(1),
  selector: z.string().min(1),
});
const resolvedSchema = z.object({
  target_handle: z.string().min(1),
  target: targetSchema,
});
export type ResolvedTarget = z.infer<typeof resolvedSchema>;

export const workspaceResumeSchema = z.object({
  prepareId: z.string().min(1),
  analysisId: z.string().min(1).optional(),
  targets: z.array(targetSchema).min(1).max(MAX_WORKSPACE_TARGETS),
});
export type WorkspaceResume = z.infer<typeof workspaceResumeSchema>;

const pageSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  next_cursor: z.string().nullable(),
  completeness: z.enum(["complete", "partial", "best_effort"]),
  warnings: z.array(z.string()),
});
export type SourcePage = z.infer<typeof pageSchema>;
export type SourceResource =
  | "repositories"
  | "branches"
  | "tags"
  | "reviews"
  | "commits"
  | "externals";
export type SourceQuery = {
  server_id: string;
  resource: SourceResource;
  ref?: RepositoryRef;
  filters: { revision?: string };
  cursor?: string;
};
export type Comparison = { base_handle: string; target_handle: string };

export class WorkspaceError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

async function post(path: string, body: object, signal?: AbortSignal) {
  const response = await apiFetch(`/code-analysis/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WorkspaceError(
      extractErrorMessage(
        data?.detail,
        "Code workspace request failed. Try again."
      ),
      data?.detail?.code
    );
  }
  return data as unknown;
}

const pendingSchema = z.object({ job_id: z.string().min(1) });

/** Discovery can return a value immediately or a durable metadata job. */
async function metadataResult(
  data: unknown,
  threadId: string,
  signal: AbortSignal
) {
  const pending = pendingSchema.safeParse(data);
  if (!pending.success) return data;
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const job = await getAnalysisJob(pending.data.job_id, signal);
    if (job.thread_id !== threadId || job.job_id !== pending.data.job_id)
      throw new WorkspaceError("Received a job for a different conversation.");
    if (job.status === "succeeded") return job.result;
    if (!shouldPoll(job.status))
      throw new WorkspaceError(
        job.error_message || "Source lookup did not complete. Try again.",
        job.error_code ?? undefined
      );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 1000);
      function abort() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new WorkspaceError("Source lookup took too long. Try again.");
}

export async function listWorkspaceSource(
  threadId: string,
  query: SourceQuery,
  signal: AbortSignal
): Promise<SourcePage> {
  const data = await post(
    "list",
    { thread_id: threadId, query: { limit: 50, ...query } },
    signal
  );
  const result = await metadataResult(data, threadId, signal);
  return pageSchema.parse(
    result && typeof result === "object" && "page" in result
      ? result.page
      : result
  );
}

export async function resolveWorkspaceTarget(
  threadId: string,
  ref: RepositoryRef,
  selector: string,
  signal: AbortSignal
): Promise<ResolvedTarget> {
  const data = await post(
    "resolve",
    { thread_id: threadId, ref, selector },
    signal
  );
  const resolved = resolvedSchema.parse(
    await metadataResult(data, threadId, signal)
  );
  if (
    resolved.target.ref.server_id !== ref.server_id ||
    resolved.target.ref.repository !== ref.repository
  )
    throw new WorkspaceError(
      "Resolved revision does not match the selected repository."
    );
  return resolved;
}

async function submitJob(
  path: "prepare" | "analyze",
  threadId: string,
  body: object,
  signal: AbortSignal
): Promise<AnalysisJobView> {
  const job = analysisJobSchema.parse(
    await post(path, { thread_id: threadId, ...body }, signal)
  );
  if (job.thread_id !== threadId || job.operation !== path)
    throw new WorkspaceError("Received an unexpected code analysis job.");
  return job;
}

export function prepareWorkspace(
  threadId: string,
  targetHandles: string[],
  key: string,
  signal: AbortSignal
) {
  return submitJob(
    "prepare",
    threadId,
    { target_handles: targetHandles, idempotency_key: key },
    signal
  );
}

export function analyzePreparedWorkspace(
  threadId: string,
  input: {
    workspace_handle: string;
    target_handles: string[];
    question: string;
    comparisons: Comparison[];
    engine?: AnalysisEngine;
    questions?: { id: string; question: string }[];
  },
  key: string,
  signal: AbortSignal
) {
  return submitJob(
    "analyze",
    threadId,
    { ...input, idempotency_key: key },
    signal
  );
}

export async function releasePreparedWorkspace(
  threadId: string,
  signal: AbortSignal
) {
  return z
    .object({
      status: z.string(),
      message: z.string(),
      handle_id: z.string().optional(),
    })
    .parse(await post("workspaces/release", { thread_id: threadId }, signal));
}

/** Provider list items are metadata; selecting one still requires resolution. */
export function sourceChoice(
  item: SourcePage["items"][number],
  resource: SourceResource,
  provider: "gerrit" | "plastic"
) {
  const text = (key: string) =>
    typeof item[key] === "string" ? (item[key] as string) : "";
  const name = text("name");
  const repository = text("repository");
  switch (resource) {
    case "repositories":
      return { label: repository, repository, selector: "" };
    case "branches":
    case "tags": {
      const ref = text("ref");
      const selector =
        provider === "gerrit"
          ? ref
          : name && `${resource === "branches" ? "br" : "lb"}:${name}`;
      return { label: ref || name, selector };
    }
    case "commits": {
      const revision = text("revision");
      return {
        label: revision && `Changeset ${revision}`,
        selector: revision && `cs:${revision}`,
        detail: text("message"),
      };
    }
    case "reviews": {
      const revision = text("current_revision");
      return {
        label: revision && (text("subject") || revision),
        selector: revision,
        detail: text("branch"),
      };
    }
    case "externals":
      return {
        label: name || repository,
        repository,
        serverId: text("server_id"),
        selector: text("selector"),
        detail:
          !repository || !text("selector")
            ? "No configured repository or revision"
            : item.immutable === false
            ? "Floating reference · resolved when added"
            : text("location"),
      };
  }
}
