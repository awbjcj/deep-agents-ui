"use client";

import type { ThreadItem } from "@/app/hooks/useThreads";
import { useThreads } from "@/app/hooks/useThreads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useClient } from "@/providers/ClientProvider";
import { format } from "date-fns";
import { Loader2, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type StatusFilter = "all" | "idle" | "busy" | "interrupted" | "error";

const GROUP_LABELS = {
  interrupted: "Requiring Attention",
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  older: "Older",
} as const;

const STATUS_COLORS: Record<ThreadItem["status"], string> = {
  idle: "bg-emerald-400",
  busy: "bg-sky-400",
  interrupted: "bg-amber-400",
  error: "bg-rose-500",
};

function getThreadColor(status: ThreadItem["status"]): string {
  return STATUS_COLORS[status] ?? "bg-gray-400";
}

function formatTime(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return format(date, "HH:mm");
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, "EEEE");
  return format(date, "MM/dd");
}

function StatusFilterItem({
  status,
  label,
  badge,
}: {
  status: ThreadItem["status"];
  label: string;
  badge?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-block size-2 rounded-full",
          getThreadColor(status)
        )}
      />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold leading-none text-destructive-foreground">
          {badge}
        </span>
      )}
    </span>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <p className="text-sm font-medium text-destructive">
        Failed to load threads
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-16 w-full"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <MessageSquare className="mb-3 h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">No threads found</p>
    </div>
  );
}

interface ThreadListProps {
  onThreadSelect: (id: string | null) => void;
  onMutateReady?: (mutate: () => void) => void;
  onClose?: () => void;
  onInterruptCountChange?: (count: number) => void;
  userId?: string;
}

export function ThreadList({
  onThreadSelect,
  onMutateReady,
  onClose,
  onInterruptCountChange,
  userId,
}: ThreadListProps) {
  const client = useClient();
  const [currentThreadId] = useQueryState("threadId");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingOriginal, setEditingOriginal] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tracks whether the current rename was cancelled via Escape, so onBlur doesn't save.
  const cancelledRef = useRef(false);

  const threads = useThreads({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 20,
    userId,
  });

  const flattened = useMemo(() => threads.data?.flat() ?? [], [threads.data]);

  const grouped = useMemo(() => {
    const now = new Date();
    const groups: Record<keyof typeof GROUP_LABELS, ThreadItem[]> = {
      interrupted: [],
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };

    flattened.forEach((thread) => {
      if (thread.status === "interrupted") {
        groups.interrupted.push(thread);
        return;
      }

      const diff = now.getTime() - thread.updatedAt.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        groups.today.push(thread);
      } else if (days === 1) {
        groups.yesterday.push(thread);
      } else if (days < 7) {
        groups.week.push(thread);
      } else {
        groups.older.push(thread);
      }
    });

    return groups;
  }, [flattened]);

  const interruptedCount = grouped.interrupted.length;

  const isLoadingMore =
    threads.size > 0 && threads.data?.[threads.size - 1] == null;
  const isEmpty = threads.data?.at(0)?.length === 0;
  const isReachingEnd = isEmpty || (threads.data?.at(-1)?.length ?? 0) < 20;

  // Always keep mutateRef current so callbacks never capture a stale reference.
  const mutateRef = useRef(threads.mutate);
  mutateRef.current = threads.mutate;

  const mutateFn = useCallback(() => mutateRef.current(), []);

  useEffect(() => {
    onMutateReady?.(mutateFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onInterruptCountChange?.(interruptedCount);
  }, [interruptedCount, onInterruptCountChange]);

  const handleStartRename = useCallback(
    (thread: ThreadItem, e: React.MouseEvent) => {
      e.stopPropagation();
      cancelledRef.current = false;
      setEditingId(thread.id);
      setEditingValue(thread.title);
      setEditingOriginal(thread.title);
    },
    []
  );

  const handleSaveRename = useCallback(
    async (threadId: string) => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      const trimmed = editingValue.trim();
      setEditingId(null);
      if (trimmed === editingOriginal) return;
      try {
        await client.threads.update(threadId, {
          metadata: { custom_name: trimmed || null },
        });
        mutateRef.current();
      } catch {
        toast.error("Failed to rename thread");
      }
    },
    [editingValue, editingOriginal, client]
  );

  const handleCancelRename = useCallback(() => {
    cancelledRef.current = true;
    setEditingId(null);
    setEditingValue("");
  }, []);

  const deleteTarget = useMemo(
    () => flattened.find((t) => t.id === deleteTargetId),
    [flattened, deleteTargetId]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    const isCurrentThread = currentThreadId === deleteTargetId;
    const idx = flattened.findIndex((t) => t.id === deleteTargetId);
    const nextThread = flattened[idx + 1] ?? flattened[idx - 1] ?? null;
    try {
      await client.threads.delete(deleteTargetId);
      if (isCurrentThread) {
        onThreadSelect(nextThread?.id ?? null);
      }
      await mutateRef.current();
      setDeleteTargetId(null);
      toast.success("Thread deleted");
    } catch {
      toast.error("Failed to delete thread");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId, currentThreadId, flattened, client, onThreadSelect]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <div className="grid flex-shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight">Threads</h2>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Active</SelectLabel>
                <SelectItem value="idle">
                  <StatusFilterItem
                    status="idle"
                    label="Idle"
                  />
                </SelectItem>
                <SelectItem value="busy">
                  <StatusFilterItem
                    status="busy"
                    label="Busy"
                  />
                </SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Attention</SelectLabel>
                <SelectItem value="interrupted">
                  <StatusFilterItem
                    status="interrupted"
                    label="Interrupted"
                    badge={interruptedCount}
                  />
                </SelectItem>
                <SelectItem value="error">
                  <StatusFilterItem
                    status="error"
                    label="Error"
                  />
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
              aria-label="Close threads sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-0 flex-1">
        {threads.error && <ErrorState message={threads.error.message} />}

        {!threads.error && !threads.data && threads.isLoading && (
          <LoadingState />
        )}

        {!threads.error && !threads.isLoading && isEmpty && <EmptyState />}

        {!threads.error && !isEmpty && (
          <div className="box-border w-full max-w-full overflow-hidden p-2">
            {(
              Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>
            ).map((group) => {
              const groupThreads = grouped[group];
              if (groupThreads.length === 0) return null;

              return (
                <div
                  key={group}
                  className="mb-5 first:mt-1"
                >
                  <div className="mb-1 flex items-center gap-2 px-3">
                    <h4 className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
                      {GROUP_LABELS[group]}
                    </h4>
                    <div
                      aria-hidden="true"
                      className="h-px flex-1 bg-border/50"
                    />
                  </div>
                  <div
                    role="list"
                    className="flex flex-col gap-0.5"
                  >
                    {groupThreads.map((thread) => (
                      <div
                        key={thread.id}
                        role="listitem"
                        tabIndex={editingId === thread.id ? -1 : 0}
                        aria-current={
                          currentThreadId === thread.id ? true : undefined
                        }
                        onClick={() =>
                          editingId !== thread.id && onThreadSelect(thread.id)
                        }
                        onKeyDown={(e) => {
                          if (
                            (e.key === "Enter" || e.key === " ") &&
                            editingId !== thread.id
                          ) {
                            e.preventDefault();
                            onThreadSelect(thread.id);
                          }
                        }}
                        className={cn(
                          "group relative cursor-pointer rounded-md py-2 pl-3 pr-2 transition-colors duration-150",
                          "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60",
                          currentThreadId === thread.id
                            ? "bg-accent"
                            : "bg-transparent",
                          editingId === thread.id && "cursor-default"
                        )}
                      >
                        {/* Left accent bar — Aptiv orange on active row */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "pointer-events-none absolute inset-y-2 left-0 w-[2px] rounded-full transition-opacity",
                            currentThreadId === thread.id
                              ? "opacity-100"
                              : "opacity-0"
                          )}
                          style={{ background: "var(--aptiv-orange)" }}
                        />

                        {/* Title row */}
                        <div className="flex items-baseline gap-2">
                          {editingId === thread.id ? (
                            <Input
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => handleSaveRename(thread.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  cancelledRef.current = false;
                                  e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                  handleCancelRename();
                                  e.currentTarget.blur();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-auto flex-1 border-0 border-b border-primary/40 bg-transparent p-0 text-[13px] font-semibold leading-tight tracking-tight shadow-none focus-visible:border-primary focus-visible:ring-0 rounded-none"
                            />
                          ) : (
                            <h3
                              className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight tracking-tight"
                              title={thread.title}
                            >
                              {thread.title}
                            </h3>
                          )}
                          <span className="flex-shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground/60">
                            {formatTime(thread.updatedAt)}
                          </span>
                        </div>

                        {/* Meta row — description + status + actions (always visible) */}
                        <div className="mt-1 flex items-center gap-1.5">
                          <p className="min-w-0 flex-1 truncate text-[11px] leading-snug text-muted-foreground/75">
                            {thread.description || (
                              <span className="italic opacity-60">
                                No response yet
                              </span>
                            )}
                          </p>
                          {/* Fixed-width slot: dot and buttons share the same position */}
                          <div className="relative h-5 w-[42px] flex-shrink-0">
                            <span
                              aria-hidden="true"
                              title={thread.status}
                              className={cn(
                                "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ring-2 ring-background/40 transition-opacity duration-150",
                                getThreadColor(thread.status),
                                editingId !== thread.id &&
                                  "group-hover:opacity-0 group-focus-within:opacity-0"
                              )}
                            />
                            {editingId !== thread.id && (
                              <div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground/70 hover:bg-background/70 hover:text-foreground"
                                  aria-label="Rename thread"
                                  onClick={(e) => handleStartRename(thread, e)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground/70 hover:bg-background/70 hover:text-destructive"
                                  aria-label="Delete thread"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTargetId(thread.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {!isReachingEnd && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => threads.setSize(threads.size + 1)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTargetId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-sm"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Delete thread?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                &ldquo;{deleteTarget?.title}&rdquo;
              </span>{" "}
              will be permanently removed and cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
