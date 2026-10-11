"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/auth";
import { saveBlob } from "@/lib/file-downloads";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Job {
  id: string;
  model: string;
  status: string;
  result?: {
    output?: Array<{
      type: string;
      content?: Array<{
        text?: string;
        annotations?: Array<{
          type: string;
          file_id?: string;
          filename?: string;
        }>;
      }>;
    }>;
  };
}
const active = (job: Job) =>
  ["submitting", "queued", "in_progress", "unknown"].includes(job.status);

/** Inspect, cancel and delete this thread's provider jobs without leaving chat. */
export function ResponseJobs({ threadId }: { threadId: string | null }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors.at(-1);
  const base = threadId
    ? `/api/threads/${encodeURIComponent(threadId)}/response-jobs`
    : "";

  useEffect(() => {
    if (!open || !base) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await apiFetch(
          before ? `${base}?before=${encodeURIComponent(before)}` : base,
          { signal: controller.signal }
        );
        if (response.status === 404 && before)
          throw new Error(
            "This page is no longer available. Open Newest jobs to continue."
          );
        if (!response.ok)
          throw new Error("Background jobs could not be loaded.");
        const listed: Job[] = await response.json();
        let stale = false;
        const refreshed = await Promise.all(
          listed.map(async (job) => {
            if (!active(job)) return job;
            try {
              const result = await apiFetch(
                `${base}/${encodeURIComponent(job.id)}`,
                { signal: controller.signal }
              );
              if (!result.ok) throw new Error("Status unavailable");
              return (await result.json()) as Job;
            } catch {
              stale = true;
              return job;
            }
          })
        );
        if (!controller.signal.aborted) {
          setJobs(refreshed);
          setLoaded(true);
          setError(
            stale
              ? "Some job statuses could not be refreshed. Displayed statuses may be out of date."
              : ""
          );
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Could not load jobs."
          );
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [open, base, before, revision]);

  function changePage(nextCursors: string[]) {
    setCursors(nextCursors);
    setJobs([]);
    setLoaded(false);
    setError("");
    setActionError("");
  }

  async function act(job: Job, operation: "cancel" | "delete") {
    setBusy(job.id);
    setActionError("");
    try {
      const response = await apiFetch(
        `${base}/${encodeURIComponent(job.id)}${
          operation === "cancel" ? "/cancel" : ""
        }`,
        { method: operation === "cancel" ? "POST" : "DELETE" }
      );
      if (!response.ok)
        throw new Error(
          `Could not ${operation} the job. Refresh its status and try again.`
        );
      setRevision((value) => value + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The operation failed."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) changePage([]);
        setOpen(nextOpen);
      }}
    >
      <div className="flex justify-end px-4 pb-1">
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!threadId}
            className="gap-2 text-xs text-muted-foreground"
          >
            <Clock3
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
            Background jobs
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <div className="space-y-2 border-b border-border p-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Clock3
              className="h-5 w-5 text-primary"
              aria-hidden="true"
            />
            Background jobs
          </DialogTitle>
          <DialogDescription>
            Track model calls for this conversation and retrieve their results.
          </DialogDescription>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <p
              role="status"
              aria-atomic="true"
              className="text-xs text-muted-foreground"
            >
              {loaded
                ? `${jobs.filter(active).length} active · ${
                    jobs.length
                  } jobs on this page`
                : error
                ? "Status unavailable"
                : "Loading background jobs…"}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw
                className="h-3.5 w-3.5"
                aria-hidden="true"
              />
              Refresh
            </Button>
          </div>
          {(before || jobs.length === 50) && (
            <nav
              aria-label="Background job pages"
              className="flex flex-wrap gap-2"
            >
              {before && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => changePage([])}
                  >
                    Newest jobs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => changePage(cursors.slice(0, -1))}
                  >
                    Newer jobs
                  </Button>
                </>
              )}
              {jobs.length === 50 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!loaded || busy !== null}
                  onClick={() =>
                    changePage([...cursors, jobs[jobs.length - 1].id])
                  }
                >
                  Older jobs
                </Button>
              )}
            </nav>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {actionError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {actionError}
            </p>
          )}
          {!loaded && !error && (
            <div className="flex justify-center py-8">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
                aria-hidden="true"
              />
            </div>
          )}
          {loaded && !error && !jobs.length && (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <Clock3
                className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mb-2 text-sm font-medium">
                {before ? "No older jobs" : "No background jobs yet"}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {before
                  ? "Return to Newer jobs to view more recent results."
                  : "No background jobs in this conversation. Enable “Run models in the background” in Tool Permissions to use them."}
              </p>
            </div>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/15 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-all text-sm font-semibold">
                  {job.model}
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                  {active(job) ? (
                    <Clock3
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  ) : job.status === "completed" ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-[var(--aptiv-turquoise-dark)] dark:text-[var(--aptiv-turquoise)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleAlert
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  )}
                  {job.status.replaceAll("_", " ")}
                </span>
              </div>
              {active(job) && (
                <p className="text-xs text-muted-foreground">
                  {job.status === "unknown"
                    ? "Status is not confirmed. Refresh to check again."
                    : "Status refreshes automatically while this panel is open."}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void act(job, active(job) ? "cancel" : "delete")}
              >
                {busy === job.id ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : active(job) ? (
                  <Square
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                )}
                {active(job) ? "Cancel job" : "Delete stored response"}
              </Button>
              {job.result?.output
                ?.filter((item) => item.type === "message")
                .map((item, index) => (
                  <div
                    key={index}
                    className="space-y-2 border-t border-border pt-3"
                  >
                    {item.content?.map((part, partIndex) => (
                      <div key={partIndex}>
                        {part.text && (
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {part.text}
                          </p>
                        )}
                        {part.annotations
                          ?.filter(
                            (ref) =>
                              ref.type === "container_file_citation" &&
                              ref.file_id &&
                              ref.filename
                          )
                          .map((ref) => (
                            <Button
                              key={ref.file_id}
                              variant="link"
                              size="sm"
                              className="h-auto min-h-9 max-w-full whitespace-normal break-all text-left"
                              onClick={() =>
                                void (async () => {
                                  setActionError("");
                                  try {
                                    const response = await apiFetch(
                                      `${base}/${encodeURIComponent(
                                        job.id
                                      )}/files/${encodeURIComponent(
                                        ref.file_id!
                                      )}`
                                    );
                                    if (!response.ok)
                                      throw new Error(
                                        "This provider file is unavailable or has expired."
                                      );
                                    saveBlob(
                                      await response.blob(),
                                      ref.filename!
                                    );
                                  } catch (cause) {
                                    setActionError(
                                      cause instanceof Error
                                        ? cause.message
                                        : "Download failed."
                                    );
                                  }
                                })()
                              }
                            >
                              <Download
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              Download {ref.filename}
                            </Button>
                          ))}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
        <p className="border-t border-border bg-muted/20 px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          Cancelling stops the model call. Deleting removes its stored response.
          Downloaded thread files remain available.
        </p>
      </DialogContent>
    </Dialog>
  );
}
