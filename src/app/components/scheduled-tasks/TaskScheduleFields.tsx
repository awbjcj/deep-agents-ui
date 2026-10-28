"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  scheduledTasksAPI,
  taskDate,
  type TaskInput,
} from "@/lib/scheduled-tasks";

export const taskSelectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TaskScheduleFields({
  form,
  update,
}: {
  form: TaskInput;
  update: <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => void;
}) {
  const { local_start, timezone, frequency } = form;
  const [preview, setPreview] = useState<{
    values: string[];
    error: string;
    busy: boolean;
  }>({ values: [], error: "", busy: true });
  useEffect(() => {
    const controller = new AbortController();
    setPreview((previous) => ({ ...previous, busy: true, error: "" }));
    const timer = setTimeout(() => {
      scheduledTasksAPI
        .preview({ local_start, timezone, frequency }, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setPreview({ values: data.occurrences, busy: false, error: "" });
        })
        .catch((cause: Error) => {
          if (!controller.signal.aborted)
            setPreview({ values: [], busy: false, error: cause.message });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [local_start, timezone, frequency]);

  return (
    <section
      className="space-y-4"
      aria-labelledby="task-schedule-heading"
    >
      <h3
        id="task-schedule-heading"
        className="text-sm font-semibold"
      >
        When to run
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1.5 text-sm">
          <span id="task-start-label">Start date and time</span>
          <Input
            className="h-11 min-w-0"
            aria-labelledby="task-start-label"
            required
            type="datetime-local"
            value={local_start.slice(0, 16)}
            onChange={(e) => update("local_start", e.target.value)}
          />
        </label>
        <label className="block min-w-0 space-y-1.5 text-sm">
          <span id="task-frequency-label">Frequency</span>
          <select
            aria-labelledby="task-frequency-label"
            className={taskSelectClass}
            value={frequency}
            onChange={(e) =>
              update("frequency", e.target.value as TaskInput["frequency"])
            }
          >
            <option value="once">Once</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span id="task-timezone-label">Timezone</span>
        <Input
          className="h-11"
          aria-labelledby="task-timezone-label"
          aria-describedby="task-preview"
          name="timezone"
          autoComplete="off"
          spellCheck={false}
          required
          list="task-timezones"
          value={timezone}
          onChange={(e) => update("timezone", e.target.value)}
          placeholder="America/New_York"
        />
      </label>
      <datalist id="task-timezones">
        {[
          "UTC",
          "America/New_York",
          "America/Chicago",
          "America/Los_Angeles",
          "Europe/London",
          "Europe/Berlin",
          "Asia/Shanghai",
          "Asia/Kolkata",
          "Asia/Tokyo",
          "Australia/Sydney",
        ].map((zone) => (
          <option
            key={zone}
            value={zone}
          />
        ))}
      </datalist>
      <div
        id="task-preview"
        className="border-l-2 border-primary bg-muted/30 px-4 py-3 text-sm"
        aria-live="polite"
        aria-busy={preview.busy}
      >
        <p className="font-medium">Next run</p>
        <p className="mt-1 text-muted-foreground">
          {preview.busy
            ? "Calculating…"
            : preview.error ||
              (preview.values[0]
                ? taskDate(preview.values[0], timezone) + " · " + timezone
                : "No future occurrence. Choose a later time.")}
        </p>
      </div>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="cursor-pointer py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          Missed runs and daylight saving time
        </summary>
        <p className="pt-2">
          Missed times become one catch-up run. Runs are skipped while this task
          or its destination chat is busy. Daily and weekly times follow your
          timezone; nonexistent times are skipped and repeated times run once.
        </p>
      </details>
    </section>
  );
}
