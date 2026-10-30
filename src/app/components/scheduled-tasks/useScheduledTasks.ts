"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import {
  scheduledTasksAPI,
  TaskAPIError,
  type TaskAction,
} from "@/lib/scheduled-tasks";

export function useScheduledTasks(accountId: string) {
  const [offset, setOffset] = useState(0);
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR(
    ["scheduled-tasks", accountId, offset],
    () => scheduledTasksAPI.list(offset),
    // Keep the current page while the next one loads so controls keep focus.
    { refreshInterval: 5000, keepPreviousData: true }
  );
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const runKeys = useRef(new Map<string, string>());
  async function action(id: string, name: TaskAction, occurrence?: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      let message = "Task updated.";
      if (name === "run") {
        // Reuse the request ID only when the outcome is unknown (no HTTP
        // response), so a retry cannot queue the same manual run twice.
        const key = runKeys.current.get(id) ?? crypto.randomUUID();
        runKeys.current.set(id, key);
        try {
          await scheduledTasksAPI.run(id, key);
        } catch (cause) {
          if (cause instanceof TaskAPIError) runKeys.current.delete(id);
          throw cause;
        }
        runKeys.current.delete(id);
        message = "Execution queued.";
      } else if (name === "cancel" && occurrence) {
        const { cancel_requested } = await scheduledTasksAPI.cancel(
          id,
          occurrence
        );
        message = cancel_requested
          ? "Cancellation requested. Future scheduled runs are unchanged."
          : "This run already finished.";
      } else if (name === "pause" || name === "resume")
        await scheduledTasksAPI.schedule(id, name);
      setNotice(message);
      await mutate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update task"
      );
    } finally {
      setBusy(null);
    }
  }
  return {
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
  };
}
