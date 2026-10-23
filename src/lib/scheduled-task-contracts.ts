import { z } from "zod";

/** Validate server data once, before it enters the task UI or its cache. */
export const taskInputSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  local_start: z.string(),
  timezone: z.string().min(1),
  frequency: z.enum(["once", "daily", "weekly"]),
  destination: z.enum(["new", "existing"]),
  thread_id: z.string().nullable(),
  execution_mode: z.enum(["interactive", "autopilot"]),
});

const instant = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
export const taskRunSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "queued",
    "dispatching",
    "running",
    "waiting",
    "unknown",
    "success",
    "error",
    "cancelled",
    "skipped",
  ]),
  scheduled_at: instant,
  created_at: instant,
  finished_at: instant.nullable(),
  thread_id: z.string().min(1),
  error: z.string().nullable(),
  cancel_requested: z.boolean(),
  spec: taskInputSchema.optional(),
  dispatches: z
    .array(
      z.object({
        run_id: z.string().nullable(),
        created_at: instant,
        automatic_approvals: z.record(z.string(), z.unknown()).nullable(),
      })
    )
    .optional(),
});

export const scheduledTaskSchema = taskInputSchema.extend({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.enum(["active", "paused", "complete"]),
  next_run_at: instant.nullable(),
  last_run: taskRunSchema.nullable(),
  active_run: taskRunSchema.nullable(),
});

export const taskListSchema = z.object({
  items: z.array(scheduledTaskSchema),
  scheduler_enabled: z.boolean(),
  next_offset: z.number().int().nonnegative().nullable(),
});
export const destinationSchema = z.array(
  z.object({ id: z.string().min(1), title: z.string() })
);
export const previewSchema = z.object({ occurrences: z.array(instant) });
export const historySchema = z.array(taskRunSchema);
export const queuedSchema = z.object({ queued: z.boolean() });
export const actionSchema = z.object({ ok: z.boolean() });
export const cancelSchema = z.object({ cancel_requested: z.boolean() });

export type TaskInput = z.infer<typeof taskInputSchema>;
export type ScheduleInput = Pick<
  TaskInput,
  "local_start" | "timezone" | "frequency"
>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type ScheduledTask = z.infer<typeof scheduledTaskSchema>;
export type TaskList = z.infer<typeof taskListSchema>;
export type TaskAction = "run" | "pause" | "resume" | "cancel";
