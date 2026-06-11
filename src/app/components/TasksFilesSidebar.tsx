"use client";

import React, {
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  FileText,
  CheckCircle,
  Circle,
  Clock,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TodoItem, FileItem } from "@/app/types/types";
import { useChatContext } from "@/providers/ChatProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FileViewDialog } from "@/app/components/FileViewDialog";

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Return the image MIME type for a path, or null when it isn't an image. */
function imageMimeFor(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME[ext] ?? null;
}

/** Friendly label for a file key: basename with the upload id prefix stripped. */
function fileDisplayName(path: string): string {
  const base = path.split("/").pop() || path;
  const sep = base.indexOf("__");
  return sep >= 0 ? base.slice(sep + 2) : base;
}

/** Normalize a state.files value (FileData dict or raw string) to text. */
function extractFileContent(rawContent: unknown): string {
  if (
    typeof rawContent === "object" &&
    rawContent !== null &&
    "content" in rawContent
  ) {
    const contentArray = (rawContent as { content: unknown }).content;
    if (Array.isArray(contentArray)) {
      return contentArray.join("\n");
    }
    return String(contentArray || "");
  }
  return String(rawContent || "");
}

export function FilesPopover({
  files,
  setFiles,
  editDisabled,
}: {
  files: Record<string, string>;
  setFiles: (files: Record<string, string>) => Promise<void>;
  editDisabled: boolean;
}) {
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);

  const handleSaveFile = useCallback(
    async (fileName: string, content: string) => {
      await setFiles({ ...files, [fileName]: content });
      setSelectedFile({ path: fileName, content: content });
    },
    [files, setFiles]
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      if (editDisabled) return;
      const label = fileDisplayName(filePath);
      const next: Record<string, unknown> = { ...files };
      delete next[filePath];
      try {
        await setFiles(next as Record<string, string>);
        setSelectedFile((cur) => (cur?.path === filePath ? null : cur));
        toast.success(`Deleted "${label}" from thread`);
      } catch (err) {
        toast.error(`Couldn't delete "${label}"`, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [files, setFiles, editDisabled]
  );

  return (
    <>
      {Object.keys(files).length === 0 ? (
        <div className="flex h-full items-center justify-center p-4 text-center">
          <p className="text-xs text-muted-foreground">No files created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(256px,1fr))] gap-2">
          {Object.keys(files).map((file) => {
            const filePath = String(file);
            const fileContent = extractFileContent(files[file]);
            const mime = imageMimeFor(filePath);
            const thumbnailSrc =
              mime && fileContent ? `data:${mime};base64,${fileContent}` : null;
            const label = fileDisplayName(filePath);

            return (
              <div
                key={filePath}
                className="group relative"
              >
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFile({ path: filePath, content: fileContent })
                  }
                  title={filePath}
                  className="w-full cursor-pointer space-y-1 truncate rounded-md border border-border px-2 py-3 shadow-sm transition-colors"
                  style={{
                    backgroundColor: "var(--color-file-button)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--color-file-button-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--color-file-button)";
                  }}
                >
                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={label}
                      className="mx-auto h-16 w-16 rounded object-cover ring-1 ring-border"
                    />
                  ) : (
                    <FileText
                      size={24}
                      className="mx-auto text-muted-foreground"
                    />
                  )}
                  <span className="mx-auto block w-full truncate break-words text-center text-sm leading-relaxed text-foreground">
                    {label}
                  </span>
                </button>
                {!editDisabled && (
                  <button
                    type="button"
                    aria-label={`Delete ${label}`}
                    title={`Delete ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteFile(filePath);
                    }}
                    className="absolute right-1 top-1 rounded-md bg-card/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedFile && (
        <FileViewDialog
          file={selectedFile}
          onSaveFile={handleSaveFile}
          onClose={() => setSelectedFile(null)}
          editDisabled={editDisabled}
        />
      )}
    </>
  );
}

export const TasksFilesSidebar = React.memo<{
  todos: TodoItem[];
  files: Record<string, string>;
  setFiles: (files: Record<string, string>) => Promise<void>;
}>(({ todos, files, setFiles }) => {
  const { isLoading, interrupt } = useChatContext();
  const [tasksOpen, setTasksOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);

  // Track previous counts to detect when content goes from empty to having items
  const prevTodosCount = useRef(todos.length);
  const prevFilesCount = useRef(Object.keys(files).length);

  // Auto-expand when todos go from empty to having content
  useEffect(() => {
    if (prevTodosCount.current === 0 && todos.length > 0) {
      setTasksOpen(true);
    }
    prevTodosCount.current = todos.length;
  }, [todos.length]);

  // Auto-expand when files go from empty to having content
  const filesCount = Object.keys(files).length;
  useEffect(() => {
    if (prevFilesCount.current === 0 && filesCount > 0) {
      setFilesOpen(true);
    }
    prevFilesCount.current = filesCount;
  }, [filesCount]);

  const getStatusIcon = useCallback((status: TodoItem["status"]) => {
    switch (status) {
      case "completed":
        return (
          <CheckCircle
            size={12}
            className="text-success/80"
          />
        );
      case "in_progress":
        return (
          <Clock
            size={12}
            className="text-warning/80"
          />
        );
      default:
        return (
          <Circle
            size={10}
            className="text-tertiary/70"
          />
        );
    }
  }, []);

  const groupedTodos = useMemo(() => {
    return {
      pending: todos.filter((t) => t.status === "pending"),
      in_progress: todos.filter((t) => t.status === "in_progress"),
      completed: todos.filter((t) => t.status === "completed"),
    };
  }, [todos]);

  const groupedLabels = {
    pending: "Pending",
    in_progress: "In Progress",
    completed: "Completed",
  };

  return (
    <div className="min-h-0 w-full flex-1">
      <div className="font-inter flex h-full w-full flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
            <span className="text-xs font-semibold tracking-wide text-zinc-600">
              AGENT TASKS
            </span>
            <button
              onClick={() => setTasksOpen((v) => !v)}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-transform duration-200 hover:bg-muted",
                tasksOpen ? "rotate-180" : "rotate-0"
              )}
              aria-label="Toggle tasks panel"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          {tasksOpen && (
            <div className="bg-muted-secondary rounded-xl px-3 pb-2">
              <ScrollArea className="h-full">
                {todos.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No tasks created yet
                    </p>
                  </div>
                ) : (
                  <div className="ml-1 p-0.5">
                    {Object.entries(groupedTodos).map(([status, todos]) => (
                      <div
                        key={status}
                        className="mb-4"
                      >
                        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                          {groupedLabels[status as keyof typeof groupedLabels]}
                        </h3>
                        {todos.map((todo, index) => (
                          <div
                            key={`${status}_${todo.id}_${index}`}
                            className="mb-1.5 flex items-start gap-2 rounded-sm p-1 text-sm"
                          >
                            {getStatusIcon(todo.status)}
                            <span className="flex-1 break-words leading-relaxed text-inherit">
                              {todo.content}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
            <span className="text-xs font-semibold tracking-wide text-zinc-600">
              FILE SYSTEM
            </span>
            <button
              onClick={() => setFilesOpen((v) => !v)}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-transform duration-200 hover:bg-muted",
                filesOpen ? "rotate-180" : "rotate-0"
              )}
              aria-label="Toggle files panel"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          {filesOpen && (
            <FilesPopover
              files={files}
              setFiles={setFiles}
              editDisabled={isLoading === true || interrupt !== undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
});

TasksFilesSidebar.displayName = "TasksFilesSidebar";
