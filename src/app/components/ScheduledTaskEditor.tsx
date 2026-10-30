"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canUseAutopilot } from "@/lib/autopilot";
import {
  scheduledTasksAPI,
  taskInput,
  type ScheduledTask,
  type TaskInput,
} from "@/lib/scheduled-tasks";
import {
  TaskScheduleFields,
  taskSelectClass,
} from "./scheduled-tasks/TaskScheduleFields";
import { TaskDestinationPicker } from "./scheduled-tasks/TaskDestinationPicker";

function blankTask(): TaskInput {
  const next = new Date(Date.now() + 3600000);
  return {
    name: "",
    prompt: "",
    local_start: new Date(next.getTime() - next.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    frequency: "once",
    destination: "new",
    thread_id: null,
    execution_mode: "interactive",
  };
}

export function ScheduledTaskEditor({
  task,
  role,
  onClose,
  onSaved,
  returnFocus,
}: {
  task: ScheduledTask | null;
  role: string;
  onClose: () => void;
  onSaved: () => void;
  returnFocus: () => void;
}) {
  const [initial] = useState(() => (task ? taskInput(task) : blankTask()));
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const dirty = JSON.stringify(taskInput(form)) !== JSON.stringify(initial);
  const update = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  function close() {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (task)
        await scheduledTasksAPI.update(task.id, task.revision, taskInput(form));
      else await scheduledTasksAPI.create(taskInput(form));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] !animate-none flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&_button:focus-visible]:transform-none [&_button:focus-visible]:transition-none"
        overlayClassName="!animate-none"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left sm:px-6">
          <DialogTitle>
            {task ? "Edit scheduled task" : "Schedule a task"}
          </DialogTitle>
          <DialogDescription>
            Runs under your account, even when you are offline.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={save}
          className="flex min-h-0 flex-col"
        >
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <fieldset
              disabled={busy}
              className="min-w-0 space-y-5"
            >
              <label className="block space-y-1.5 text-sm font-medium">
                <span id="task-name-label">Task name</span>
                <Input
                  className="h-11"
                  aria-labelledby="task-name-label"
                  name="task-name"
                  autoComplete="off"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Weekly project review"
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                <span id="task-prompt-label">Prompt</span>
                <Textarea
                  aria-labelledby="task-prompt-label"
                  name="task-prompt"
                  autoComplete="off"
                  required
                  maxLength={32000}
                  rows={4}
                  value={form.prompt}
                  onChange={(e) => update("prompt", e.target.value)}
                  placeholder="Describe what the agent should do…"
                />
              </label>
              <TaskScheduleFields
                form={form}
                update={update}
              />
              <section
                className="space-y-4 border-t border-border pt-5"
                aria-labelledby="task-execution-heading"
              >
                <h3
                  id="task-execution-heading"
                  className="text-sm font-semibold"
                >
                  How to run
                </h3>
                <TaskDestinationPicker
                  form={form}
                  update={update}
                />
                <label className="block space-y-1.5 text-sm">
                  <span id="task-mode-label">Execution mode</span>
                  <select
                    aria-labelledby="task-mode-label"
                    aria-describedby="task-mode-description"
                    className={taskSelectClass}
                    value={form.execution_mode}
                    onChange={(e) =>
                      update(
                        "execution_mode",
                        e.target.value as TaskInput["execution_mode"]
                      )
                    }
                  >
                    <option value="interactive">Interactive</option>
                    <option
                      value="autopilot"
                      disabled={!canUseAutopilot(role)}
                    >
                      Autopilot (Allow All)
                    </option>
                  </select>
                </label>
                <p
                  id="task-mode-description"
                  className="text-sm leading-relaxed text-muted-foreground"
                >
                  {form.execution_mode === "autopilot"
                    ? "Automatically approves supported interventions. Existing tool permissions still apply."
                    : "Pauses for approvals. Open the resulting chat to respond."}
                  {!canUseAutopilot(role) &&
                    " Autopilot requires an administrator or developer account."}
                </p>
              </section>
              {task?.active_run && (
                <p className="text-sm text-muted-foreground">
                  Changes apply to future executions. The active run keeps its
                  original prompt and settings.
                </p>
              )}
            </fieldset>
          </div>
          <footer className="shrink-0 space-y-3 border-t border-border bg-background px-5 py-4 sm:px-6">
            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="text-sm text-[var(--text-error)] focus-visible:outline-none"
              >
                {error}
              </p>
            )}
            {discard ? (
              <div className="space-y-3">
                <p
                  role="alert"
                  className="text-sm font-medium"
                >
                  Discard your unsaved changes?
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setDiscard(false)}
                  >
                    Keep editing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 text-[var(--text-error)]"
                    onClick={onClose}
                  >
                    Discard changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 focus-visible:transform-none focus-visible:transition-none"
                  onClick={close}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="min-h-11 focus-visible:transform-none focus-visible:transition-none"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save task"}
                </Button>
              </div>
            )}
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
