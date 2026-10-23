"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scheduledTasksAPI, type ScheduledTask } from "@/lib/scheduled-tasks";

export function TaskDeleteDialog({
  task,
  onClose,
  onDeleted,
  returnFocus,
}: {
  task: ScheduledTask;
  onClose: () => void;
  onDeleted: () => void;
  returnFocus: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await scheduledTasksAPI.delete(task.id);
      onDeleted();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete task"
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="!animate-none [&_button:focus-visible]:transform-none [&_button:focus-visible]:transition-none"
        overlayClassName="!animate-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete scheduled task?</DialogTitle>
          <DialogDescription className="break-words">
            “{task.name}” will be removed from your task list. Its future runs
            will stop.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="text-sm text-[var(--text-error)]"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            className="min-h-11"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Keep task
          </Button>
          <Button
            className="min-h-11 text-[var(--text-error)]"
            variant="outline"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
