import { apiFetch, extractErrorMessage } from "@/lib/auth";
import type { z } from "zod";
import {
  taskListSchema,
  scheduledTaskSchema,
  previewSchema,
  destinationSchema,
  historySchema,
  queuedSchema,
  actionSchema,
  cancelSchema,
  type TaskInput,
  type TaskRun,
  type ScheduleInput,
} from "./scheduled-task-contracts";
export type {
  TaskInput,
  TaskRun,
  ScheduledTask,
  TaskList,
  TaskAction,
} from "./scheduled-task-contracts";

export const taskStatus: Record<string, string> = {
  active: "Scheduled",
  paused: "Paused",
  complete: "Complete",
  queued: "Queued",
  dispatching: "Starting",
  running: "Running",
  waiting: "Needs input",
  unknown: "Checking dispatch",
  success: "Succeeded",
  error: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

/** Scheduled prompts and their manual resumes use the supervisor graph. */
export function scheduledChatHref(threadId: string): string {
  return `/?${new URLSearchParams({
    threadId,
    assistantId: "VSDA Deep Agent",
  })}`;
}

export function isActiveRun(run: TaskRun): boolean {
  return !["success", "error", "cancelled", "skipped"].includes(run.status);
}

export function taskDate(value: string | null, timezone: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return "Choose a valid date and timezone";
  }
}

/** Send only editable fields, never persisted state or identity overrides. */
export function taskInput(task: TaskInput): TaskInput {
  return {
    name: task.name,
    prompt: task.prompt,
    local_start: task.local_start,
    timezone: task.timezone,
    frequency: task.frequency,
    destination: task.destination,
    thread_id: task.destination === "existing" ? task.thread_id : null,
    execution_mode: task.execution_mode,
  };
}

export class TaskAPIError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TaskAPIError";
  }
}

async function taskRequest<T>(
  schema: z.ZodType<T>,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(`/scheduled-tasks${path}`, {
    method,
    signal,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new TaskAPIError(
      extractErrorMessage(data?.detail, "Could not update scheduled tasks"),
      response.status
    );
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new TaskAPIError(
      "The task service returned an invalid response. Refresh and try again.",
      502
    );
  return parsed.data;
}

/** Endpoint functions make method, payload, and response contracts explicit. */
export const scheduledTasksAPI = {
  list: (offset = 0) =>
    taskRequest(taskListSchema, `?offset=${offset}&limit=20`),
  history: (id: string, offset = 0) =>
    taskRequest(
      historySchema,
      `/${encodeURIComponent(id)}/history?offset=${offset}`
    ),
  destinations: (offset: number, signal?: AbortSignal) =>
    taskRequest(
      destinationSchema,
      `/destinations?offset=${offset}`,
      "GET",
      undefined,
      signal
    ),
  preview: (schedule: ScheduleInput, signal?: AbortSignal) =>
    taskRequest(previewSchema, "/preview", "POST", schedule, signal),
  create: (input: TaskInput) =>
    taskRequest(scheduledTaskSchema, "", "POST", input),
  update: (id: string, revision: number, input: Partial<TaskInput>) =>
    taskRequest(scheduledTaskSchema, `/${encodeURIComponent(id)}`, "PATCH", {
      ...input,
      revision,
    }),
  run: (id: string, requestId: string) =>
    taskRequest(queuedSchema, `/${encodeURIComponent(id)}/run`, "POST", {
      request_id: requestId,
    }),
  schedule: (id: string, action: "pause" | "resume") =>
    taskRequest(actionSchema, `/${encodeURIComponent(id)}/${action}`, "POST"),
  cancel: (id: string, occurrenceId: string) =>
    taskRequest(
      cancelSchema,
      `/${encodeURIComponent(id)}/history/${encodeURIComponent(
        occurrenceId
      )}/cancel`,
      "POST"
    ),
  delete: async (id: string): Promise<void> => {
    const response = await apiFetch(
      `/scheduled-tasks/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new TaskAPIError(
        extractErrorMessage(data?.detail, "Could not delete task"),
        response.status
      );
    }
  },
};
