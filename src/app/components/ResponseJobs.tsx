"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { saveBlob } from "@/lib/file-downloads";
import {
  Dialog,
  DialogContent,
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
export function ResponseJobs({
  threadId,
  isRunning = false,
  onEmptyClose,
}: {
  threadId: string | null;
  isRunning?: boolean;
  onEmptyClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hasJobs, setHasJobs] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors.at(-1);
  const base = threadId
    ? `/threads/${encodeURIComponent(threadId)}/response-jobs`
    : "";

  useEffect(() => {
    if (!base) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading || document.hidden) return;
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
        if (controller.signal.aborted) return;
        // Only the newest page establishes whether this conversation has jobs.
        if (!before) setHasJobs(listed.length > 0);
        if (!open) return;
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
    // Discover jobs while the panel is closed without polling every job's status.
    const timer = setInterval(() => void load(), open ? 3000 : 15000);
    const refreshOnFocus = () => void load();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [open, base, before, revision, isRunning]);

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
        changePage([]);
        setOpen(nextOpen);
      }}
    >
      {(hasJobs || open) && (
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Background jobs"
            title="Background jobs"
            className="text-muted-foreground hover:text-foreground h-9 min-w-9 shrink-0 gap-1.5 rounded-lg px-2 text-xs transition-none active:scale-[0.97] motion-reduce:transform-none"
          >
            <Clock3
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
            <span className="sr-only @[26rem]/composer:not-sr-only">Jobs</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (!hasJobs && onEmptyClose) {
            event.preventDefault();
            onEmptyClose();
          }
        }}
      >
        <div className="border-border shrink-0 space-y-2 border-b p-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Clock3
              className="text-primary h-5 w-5"
              aria-hidden="true"
            />
            Background jobs
          </DialogTitle>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p
              role="status"
              aria-atomic="true"
              className="text-muted-foreground text-xs tabular-nums"
            >
              {loaded
                ? jobs.length
                  ? `${jobs.filter(active).length} active · ${
                      jobs.length
                    } on this page`
                  : ""
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
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
            >
              {error}
            </p>
          )}
          {actionError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
            >
              {actionError}
            </p>
          )}
          {!loaded && !error && (
            <div className="flex justify-center py-8">
              <Loader2
                className="text-muted-foreground h-5 w-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            </div>
          )}
          {loaded && !error && !jobs.length && (
            <div className="border-border rounded-xl border border-dashed px-5 py-8 text-center">
              <Clock3
                className="text-muted-foreground mx-auto mb-3 h-6 w-6"
                aria-hidden="true"
              />
              <p className="mb-2 text-sm font-medium">
                {before ? "No older jobs" : "No background jobs yet"}
              </p>
              {!before && (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Enable “Run models in the background” in Workspace → Tools.
                </p>
              )}
            </div>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="border-border bg-card min-w-0 space-y-3 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold break-all">
                  {job.model}
                </p>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
                    job.status === "completed"
                      ? "border-border bg-muted/30 text-(--text-brand-secondary)"
                      : job.status === "failed" || job.status === "incomplete"
                        ? "border-amber-500/30 bg-amber-500/10 text-(--text-warning)"
                        : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  {active(job) ? (
                    <Clock3
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  ) : job.status === "completed" ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5"
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
                <p className="text-muted-foreground text-xs">
                  {job.status === "unknown"
                    ? "Status is not confirmed. Refresh to check again."
                    : "Status refreshes automatically while this panel is open."}
                </p>
              )}
              {job.result?.output?.some((item) => item.type === "message") && (
                <details className="group/result border-border/70 bg-muted/15 rounded-lg border">
                  <summary className="hover:bg-muted/40 focus-visible:ring-ring flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                    View result
                    <ChevronDown
                      className="text-muted-foreground h-3.5 w-3.5 shrink-0 group-open/result:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="border-border/70 space-y-3 border-t p-3">
                    {job.result?.output
                      ?.filter((item) => item.type === "message")
                      .map((item, index) => (
                        <div
                          key={index}
                          className="space-y-2"
                        >
                          {item.content?.map((part, partIndex) => (
                            <div
                              key={partIndex}
                              className="space-y-2"
                            >
                              {part.text && (
                                <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
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
                                    variant="outline"
                                    size="sm"
                                    className="h-auto min-h-9 max-w-full justify-start text-left break-all whitespace-normal"
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
                </details>
              )}
              <div className="border-border/60 flex justify-end border-t pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-auto min-h-8 text-xs whitespace-normal"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(job, active(job) ? "cancel" : "delete")
                  }
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
                  {busy === job.id
                    ? active(job)
                      ? "Cancelling…"
                      : "Deleting…"
                    : active(job)
                      ? "Cancel job"
                      : "Delete stored response"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="border-border bg-muted/20 text-muted-foreground shrink-0 border-t px-5 py-3 text-xs leading-relaxed">
          Cancelling stops the model call. Deleting removes its stored response.
          Downloaded thread files remain available.
        </p>
      </DialogContent>
    </Dialog>
  );
}
