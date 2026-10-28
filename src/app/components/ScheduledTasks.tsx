"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduledTaskEditor } from "./ScheduledTaskEditor";
import { TaskRow } from "./scheduled-tasks/TaskRow";
import { TaskHistory } from "./scheduled-tasks/TaskHistory";
import { TaskDeleteDialog } from "./scheduled-tasks/TaskDeleteDialog";
import type { ScheduledTask } from "@/lib/scheduled-tasks";
import { useScheduledTasks } from "./scheduled-tasks/useScheduledTasks";

type Panel =
  | { kind: "edit"; task: ScheduledTask | null }
  | { kind: "history" | "delete"; task: ScheduledTask };

export function ScheduledTasks({
  accountId,
  role,
}: {
  accountId: string;
  role: string;
}) {
  const {
    offset,
    setOffset,
    data,
    loadError,
    isLoading,
    mutate,
    refresh,
    refreshing,
    busy,
    error,
    notice,
    setNotice,
    action,
  } = useScheduledTasks(accountId);
  const [panel, setPanel] = useState<Panel | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const newTask = useRef<HTMLButtonElement>(null);

  function open(value: Panel) {
    opener.current = document.activeElement as HTMLElement;
    setPanel(value);
  }
  function returnFocus() {
    if (opener.current?.isConnected) opener.current.focus();
    else newTask.current?.focus();
  }
  const currentTask = panel?.task
    ? data?.items.find((item) => item.id === panel.task?.id) ?? panel.task
    : null;

  return (
    <main className="min-h-dvh bg-background text-foreground [&_button:focus-visible]:transform-none [&_button:focus-visible]:transition-none">
      <header className="border-b border-border px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ArrowLeft
              className="h-4 w-4"
              aria-hidden="true"
            />
            Back to chat
          </Link>
          <Button
            ref={newTask}
            className="min-h-11"
            onClick={() => open({ kind: "edit", task: null })}
          >
            <Plus
              className="h-4 w-4"
              aria-hidden="true"
            />
            New task
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Scheduled tasks
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Your prompts, on a schedule. Review upcoming runs and pick up
              results here.
            </p>
          </div>
          <Button
            variant="outline"
            className="size-11 shrink-0"
            aria-label="Refresh tasks"
            aria-busy={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={
                refreshing ? "h-4 w-4 motion-safe:animate-spin" : "h-4 w-4"
              }
              aria-hidden="true"
            />
          </Button>
        </div>
        {data?.scheduler_enabled === false && (
          <p
            role="status"
            className="rounded-md border border-border bg-muted p-4 text-sm"
          >
            The scheduler is disabled by an administrator. Tasks are saved, but
            executions will wait until it is enabled.
          </p>
        )}
        {(loadError || error) && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p
              role="alert"
              className="text-sm text-[var(--text-error)]"
            >
              {error || loadError.message}
            </p>
            {loadError && (
              <Button
                className="mt-3 min-h-11"
                variant="outline"
                onClick={() => void mutate()}
              >
                Retry loading tasks
              </Button>
            )}
          </div>
        )}
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {notice}
        </p>
        {isLoading && (
          <div
            role="status"
            aria-busy="true"
            className="space-y-3 py-4"
          >
            <span className="sr-only">Loading scheduled tasks…</span>
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-24 rounded-md bg-muted/50"
              />
            ))}
          </div>
        )}
        {data?.items.length === 0 && (
          <section className="border-y border-border py-12">
            <CalendarClock
              className="mb-4 h-7 w-7 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-lg font-medium">
              {offset
                ? "No tasks on this page"
                : "Make room for recurring work"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {offset
                ? "Return to the previous page to see your remaining tasks."
                : "Schedule a one-time task, a daily briefing, or a weekly review. Start a new chat or continue an existing one."}
            </p>
            {!offset && (
              <Button
                className="mt-5 min-h-11"
                onClick={() => open({ kind: "edit", task: null })}
              >
                Schedule your first task
              </Button>
            )}
          </section>
        )}
        {!!data?.items.length && (
          <div className="overflow-hidden rounded-lg border border-border">
            {data.items.map((item) => (
              <TaskRow
                key={item.id}
                task={item}
                busy={busy !== null}
                onAction={(name, occurrence) =>
                  void action(item.id, name, occurrence)
                }
                onEdit={() => open({ kind: "edit", task: item })}
                onHistory={() => open({ kind: "history", task: item })}
                onDelete={() => open({ kind: "delete", task: item })}
              />
            ))}
          </div>
        )}
        {(offset > 0 || data?.next_offset != null) && (
          <nav
            aria-label="Task pages"
            className="flex items-center justify-between gap-3"
          >
            <Button
              className="min-h-11"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous tasks
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              Page {Math.floor(offset / 20) + 1}
            </span>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={data?.next_offset == null}
              onClick={() => {
                if (data?.next_offset != null) setOffset(data.next_offset);
              }}
            >
              Next tasks
            </Button>
          </nav>
        )}
      </div>
      {panel?.kind === "edit" && (
        <ScheduledTaskEditor
          task={panel.task}
          role={role}
          returnFocus={returnFocus}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setNotice("Task saved.");
            void mutate();
          }}
        />
      )}
      {panel?.kind === "history" && currentTask && (
        <TaskHistory
          task={currentTask}
          accountId={accountId}
          onClose={() => setPanel(null)}
          returnFocus={returnFocus}
          onChanged={(message) => {
            setNotice(message);
            void mutate();
          }}
        />
      )}
      {panel?.kind === "delete" && currentTask && (
        <TaskDeleteDialog
          task={currentTask}
          onClose={() => setPanel(null)}
          returnFocus={returnFocus}
          onDeleted={() => {
            opener.current = newTask.current;
            setPanel(null);
            setNotice("Task deleted.");
            void mutate();
          }}
        />
      )}
    </main>
  );
}
