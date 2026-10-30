"use client";
import { chatHref } from "@/lib/chat-links";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  isActiveRun,
  scheduledTasksAPI,
  taskDate,
  taskStatus,
  type ScheduledTask,
} from "@/lib/scheduled-tasks";

const approvalLabel = (count: number) =>
  `Automatically approved ${count} ${
    count === 1 ? "intervention" : "interventions"
  }`;

export function TaskHistory({
  task,
  accountId,
  onClose,
  returnFocus,
  onChanged,
}: {
  task: ScheduledTask;
  accountId: string;
  onClose: () => void;
  returnFocus: () => void;
  onChanged: (message: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { data, error, mutate, isLoading } = useSWR(
    ["scheduled-history", accountId, task.id, offset],
    () => scheduledTasksAPI.history(task.id, offset),
    { refreshInterval: 5000 }
  );
  async function cancel(id: string) {
    setBusy(true);
    setActionError("");
    try {
      const { cancel_requested } = await scheduledTasksAPI.cancel(task.id, id);
      await mutate();
      onChanged(
        cancel_requested
          ? "Cancellation requested. Future scheduled runs are unchanged."
          : "This run already finished."
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Could not cancel execution"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] !animate-none flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&_button:focus-visible]:transform-none [&_button:focus-visible]:transition-none"
        overlayClassName="!animate-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader className="border-b border-border px-5 py-5 text-left">
          <DialogTitle>Execution history</DialogTitle>
          <DialogDescription className="break-words">
            {task.name}
          </DialogDescription>
        </DialogHeader>
        <section
          aria-label="Execution history"
          className="min-h-0 overflow-y-auto px-5"
        >
          {(error || actionError) && (
            <div className="py-4">
              <p
                role="alert"
                className="text-sm text-[var(--text-error)]"
              >
                {actionError || error.message}
              </p>
              <Button
                variant="outline"
                className="mt-2 min-h-11"
                onClick={() => {
                  setActionError("");
                  void mutate();
                }}
              >
                Retry history
              </Button>
            </div>
          )}
          {isLoading && (
            <p
              role="status"
              className="py-8 text-sm text-muted-foreground"
            >
              Loading history…
            </p>
          )}
          {data?.length === 0 && (
            <p className="py-8 text-sm text-muted-foreground">
              No executions on this page.
            </p>
          )}
          <ol className="divide-y divide-border">
            {data?.map((run) => (
              <li
                key={run.id}
                className="space-y-3 py-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {taskStatus[run.status]}
                  </span>
                  <Link
                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
                    href={chatHref(run.thread_id)}
                  >
                    Open chat
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">
                  Scheduled{" "}
                  {taskDate(
                    run.scheduled_at,
                    run.spec?.timezone ?? task.timezone
                  )}{" "}
                  · {run.spec?.timezone ?? task.timezone}
                </p>
                {run.error && (
                  <p className="break-words text-sm text-muted-foreground">
                    {run.error}
                  </p>
                )}
                {run.spec && (
                  <details className="text-sm">
                    <summary className="cursor-pointer py-2 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                      Prompt and execution details
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {run.spec.prompt}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {run.spec.execution_mode === "autopilot"
                        ? "Autopilot"
                        : "Interactive"}{" "}
                      ·{" "}
                      {run.spec.destination === "new"
                        ? "New chat"
                        : "Existing chat"}
                    </p>
                    {run.dispatches?.map((dispatch, index) => (
                      <p
                        key={dispatch.run_id ?? index}
                        className="mt-2 break-all text-xs text-muted-foreground"
                      >
                        {dispatch.automatic_approvals
                          ? approvalLabel(
                              Object.keys(dispatch.automatic_approvals).length
                            )
                          : "Prompt dispatched"}{" "}
                        · {dispatch.run_id ?? "Awaiting acknowledgment"}
                      </p>
                    ))}
                  </details>
                )}
                {isActiveRun(run) && (
                  <Button
                    className="min-h-11"
                    variant="outline"
                    disabled={busy || run.cancel_requested}
                    onClick={() => void cancel(run.id)}
                  >
                    {run.cancel_requested
                      ? "Cancellation pending"
                      : "Cancel execution"}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </section>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Newer
          </Button>
          <Button
            className="min-h-11"
            variant="outline"
            onClick={onClose}
          >
            Close history
          </Button>
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={(data?.length ?? 0) < 50 || isLoading}
            onClick={() => setOffset(offset + 50)}
          >
            Older
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
