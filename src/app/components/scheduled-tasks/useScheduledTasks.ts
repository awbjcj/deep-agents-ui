"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { scheduledTasksAPI, type TaskAction } from "@/lib/scheduled-tasks";

export function useScheduledTasks(accountId: string) {
  const [offset, setOffset] = useState(0);
  const {
    data,
    error: loadError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    ["scheduled-tasks", accountId, offset],
    () => scheduledTasksAPI.list(offset),
    { refreshInterval: 5000 }
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const runKeys = useRef(new Map<string, string>());
  async function action(id: string, name: TaskAction, occurrence?: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      if (name === "run") {
        const key = runKeys.current.get(id) ?? crypto.randomUUID();
        runKeys.current.set(id, key);
        await scheduledTasksAPI.run(id, key);
        runKeys.current.delete(id);
      } else if (name === "cancel" && occurrence)
        await scheduledTasksAPI.cancel(id, occurrence);
      else if (name === "pause" || name === "resume")
        await scheduledTasksAPI.schedule(id, name);
      setNotice(
        name === "run"
          ? "Execution queued."
          : name === "cancel"
          ? "Cancellation requested. Future scheduled runs are unchanged."
          : "Task updated."
      );
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
    isValidating,
    mutate,
    busy,
    error,
    notice,
    setNotice,
    action,
  };
}
