"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scheduledTasksAPI, type TaskInput } from "@/lib/scheduled-tasks";
import { taskSelectClass } from "./TaskScheduleFields";

export function TaskDestinationPicker({
  form,
  update,
}: {
  form: TaskInput;
  update: <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => void;
}) {
  const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState({ offset: 0, retry: 0 });

  useEffect(() => {
    if (form.destination !== "existing") return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    scheduledTasksAPI
      .destinations(page.offset, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setChats((previous) =>
          page.offset
            ? [
                ...new Map(
                  [...previous, ...items].map((chat) => [chat.id, chat])
                ).values(),
              ]
            : items
        );
        setHasMore(items.length === 50);
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [form.destination, page]);

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5 text-sm">
        <span id="task-destination-label">Chat destination</span>
        <select
          aria-labelledby="task-destination-label"
          className={taskSelectClass}
          value={form.destination}
          onChange={(e) => {
            setPage({ offset: 0, retry: 0 });
            update("destination", e.target.value as TaskInput["destination"]);
          }}
        >
          <option value="new">Create a new chat each time</option>
          <option value="existing">Continue an existing chat</option>
        </select>
      </label>
      {form.destination === "existing" && (
        <div className="space-y-2">
          <label className="block space-y-1.5 text-sm">
            <span id="task-chat-label">Existing chat</span>
            <select
              aria-labelledby="task-chat-label"
              required
              className={taskSelectClass}
              value={form.thread_id ?? ""}
              onChange={(e) => update("thread_id", e.target.value || null)}
            >
              <option value="">Choose a chat</option>
              {form.thread_id &&
                !chats.some((chat) => chat.id === form.thread_id) && (
                  <option value={form.thread_id}>{form.thread_id}</option>
                )}
              {chats.map((chat) => (
                <option
                  key={chat.id}
                  value={chat.id}
                >
                  {chat.title}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p
              role="alert"
              className="text-sm text-[var(--text-error)]"
            >
              {error}
            </p>
          )}
          {busy ? (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              Loading chats…
            </p>
          ) : error ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() =>
                setPage((current) => ({ ...current, retry: current.retry + 1 }))
              }
            >
              Retry loading chats
            </Button>
          ) : hasMore ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setPage({ offset: page.offset + 50, retry: 0 })}
            >
              Load more chats
            </Button>
          ) : (
            chats.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No chats yet. Create a new chat for this task.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
