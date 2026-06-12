"use client";

import { useState, useCallback } from "react";
import { FileText, Trash2 } from "lucide-react";
import type { FileItem } from "@/app/types/types";
import { toast } from "sonner";
import {
  attachmentDisplayName,
  fileContentToText,
  imageMimeForPath,
} from "@/lib/uploads";
import { FileViewDialog } from "@/app/components/FileViewDialog";

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
      const label = attachmentDisplayName(filePath);
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
            const fileContent = fileContentToText(files[file]);
            const mime = imageMimeForPath(filePath);
            const thumbnailSrc =
              mime && fileContent ? `data:${mime};base64,${fileContent}` : null;
            const label = attachmentDisplayName(filePath);

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
                  className="hover:border-primary/40 flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-border bg-[var(--color-file-button)] px-2 py-3 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-[var(--color-file-button-hover)] hover:shadow-md"
                >
                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={label}
                      className="h-16 w-16 rounded-md object-cover ring-1 ring-border"
                    />
                  ) : (
                    <span className="text-primary/70 flex h-16 w-16 items-center justify-center rounded-md bg-primary/5">
                      <FileText size={22} />
                    </span>
                  )}
                  <span className="block w-full truncate break-words text-center text-sm leading-relaxed text-foreground">
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

// NOTE: the standalone `TasksFilesSidebar` panel was removed — it was never
// mounted anywhere. Only `FilesPopover` (above) is consumed, by `ChatInterface`
// and `ChatComposer`'s reference dialog.
