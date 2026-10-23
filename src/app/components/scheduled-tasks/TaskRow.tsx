"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  scheduledChatHref,
  taskDate,
  taskStatus,
  type ScheduledTask,
  type TaskAction,
} from "@/lib/scheduled-tasks";

export function TaskRow({
  task,
  busy,
  onAction,
  onEdit,
  onHistory,
  onDelete,
}: {
  task: ScheduledTask;
  busy: boolean;
  onAction: (action: TaskAction, occurrence?: string) => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const active = task.active_run;
  return (
    <article className="min-w-0 border-b border-border bg-card px-4 py-5 last:border-b-0 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="min-w-0 break-words text-base font-semibold">
              {task.name}
            </h2>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
              {taskStatus[task.status]}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {task.prompt}
          </p>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {task.destination === "new" ? (
                "New chat each time"
              ) : (
                <Link
                  className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  href={scheduledChatHref(task.thread_id!)}
                >
                  Existing chat
                </Link>
              )}
            </span>
            <span>
              {task.execution_mode === "autopilot"
                ? "Autopilot (Allow All)"
                : "Interactive"}
            </span>
          </p>
        </div>
        <div className="min-w-0 text-sm">
          <p className="text-xs text-muted-foreground">
            {task.status === "paused" ? "Schedule paused" : "Next run"} ·{" "}
            {task.frequency === "once"
              ? "Once"
              : task.frequency === "daily"
              ? "Every day"
              : "Every week"}
          </p>
          <p className="mt-1 font-medium tabular-nums">
            {taskDate(task.next_run_at, task.timezone)}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {task.timezone}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {task.last_run
              ? "Last run: " +
                taskStatus[task.last_run.status] +
                " · " +
                taskDate(task.last_run.created_at, task.timezone)
              : "No executions yet"}
          </p>
        </div>
      </div>
      {active && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 border-l-2 border-primary bg-muted/40 px-3 py-2 text-sm"
          role="status"
        >
          <span className="font-medium">
            {active.cancel_requested
              ? "Cancellation pending"
              : taskStatus[active.status]}
          </span>
          <Link
            href={scheduledChatHref(active.thread_id)}
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Open chat
          </Link>
          <Button
            className="min-h-11 sm:min-h-9"
            variant="outline"
            disabled={busy || active.cancel_requested}
            onClick={() => onAction("cancel", active.id)}
          >
            Cancel run
          </Button>
          {active.error && (
            <p className="w-full break-words text-muted-foreground">
              {active.error}
            </p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Button
          className="min-h-11 sm:min-h-9"
          variant="outline"
          disabled={busy || !!active}
          onClick={() => onAction("run")}
        >
          Run now
        </Button>
        <Button
          className="min-h-11 sm:min-h-9"
          variant="ghost"
          disabled={busy}
          onClick={onEdit}
        >
          Edit
        </Button>
        {task.status !== "complete" && (
          <Button
            className="min-h-11 sm:min-h-9"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              onAction(task.status === "paused" ? "resume" : "pause")
            }
          >
            {task.status === "paused" ? "Resume" : "Pause"}
          </Button>
        )}
        <Button
          className="min-h-11 sm:min-h-9"
          variant="ghost"
          onClick={onHistory}
        >
          History
        </Button>
        <Button
          className="min-h-11 text-[var(--text-error)] sm:ml-auto sm:min-h-9"
          variant="ghost"
          disabled={busy || !!active}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
