"use client";

import { useCallback, useMemo, useState } from "react";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  attachmentDisplayName,
  fileContentToText,
  imageMimeForPath,
} from "@/lib/uploads";
import { FileViewDialog } from "@/app/components/FileViewDialog";
import { cn } from "@/lib/utils";
import {
  safeSourcePageUrl,
  SOURCE_IMAGE_LABELS,
  type SourceImageRecord,
} from "@/lib/source-images";

const NO_PENDING_PATHS: ReadonlySet<string> = new Set();

export function FilesPopover({
  files,
  pendingFilePaths = NO_PENDING_PATHS,
  setFiles,
  sourceImageAttachments,
  removeSourceImage,
  editDisabled,
}: {
  files: Record<string, string>;
  /** Files a running subagent saved that the thread has not received yet. */
  pendingFilePaths?: ReadonlySet<string>;
  setFiles: (files: Record<string, string>) => Promise<void>;
  sourceImageAttachments: Record<string, SourceImageRecord>;
  removeSourceImage: (record: SourceImageRecord) => Promise<void>;
  editDisabled: boolean;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const sourceByPath = useMemo(
    () =>
      new Map(
        Object.values(sourceImageAttachments).map((record) => [
          record.artifact_path,
          record,
        ])
      ),
    [sourceImageAttachments]
  );
  const selectedContent =
    selectedPath === null ? undefined : files[selectedPath];
  const selectedSource =
    selectedPath === null ? undefined : sourceByPath.get(selectedPath);
  const selectedFile = useMemo(
    () =>
      selectedPath !== null && selectedContent != null
        ? {
            path: selectedPath,
            content: fileContentToText(selectedContent),
            sourceImage: selectedSource,
          }
        : null,
    [selectedPath, selectedContent, selectedSource]
  );
  const closeFile = useCallback(() => setSelectedPath(null), []);

  const handleSaveFile = useCallback(
    async (fileName: string, content: string) => {
      await setFiles({ ...files, [fileName]: content });
      setSelectedPath(fileName);
    },
    [files, setFiles]
  );

  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      if (editDisabled) return;
      const label = attachmentDisplayName(filePath);
      const sourceRecord = sourceByPath.get(filePath);
      if (sourceRecord) {
        try {
          await removeSourceImage(sourceRecord);
          setSelectedPath((current) => (current === filePath ? null : current));
          toast.success(`Deleted "${label}" from thread`);
        } catch (err) {
          toast.error(`Couldn't delete "${label}"`, {
            description: err instanceof Error ? err.message : undefined,
          });
        }
        return;
      }
      const next: Record<string, unknown> = { ...files };
      delete next[filePath];
      try {
        await setFiles(next as Record<string, string>);
        setSelectedPath((cur) => (cur === filePath ? null : cur));
        toast.success(`Deleted "${label}" from thread`);
      } catch (err) {
        toast.error(`Couldn't delete "${label}"`, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [editDisabled, files, removeSourceImage, setFiles, sourceByPath]
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
            const mime = imageMimeForPath(filePath);
            // Text is decoded only for the open file, never for every card.
            const fileContent = mime ? fileContentToText(files[file]) : "";
            const thumbnailSrc =
              mime && fileContent ? `data:${mime};base64,${fileContent}` : null;
            const label = attachmentDisplayName(filePath);
            const sourceRecord = sourceByPath.get(filePath);
            const sourcePageUrl = sourceRecord
              ? safeSourcePageUrl(sourceRecord.source_page_url)
              : null;
            const pending = pendingFilePaths.has(filePath);

            return (
              <div
                key={filePath}
                className="group relative"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPath(filePath)}
                  title={filePath}
                  className={cn(
                    "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-3 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    sourceRecord
                      ? "border-primary/20 hover:border-primary/45 bg-primary/[0.035] hover:bg-primary/[0.06] hover:shadow-md"
                      : "hover:border-primary/40 border-border bg-[var(--color-file-button)] hover:bg-[var(--color-file-button-hover)] hover:shadow-md"
                  )}
                >
                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={label}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <span className="text-primary/70 flex h-16 w-16 items-center justify-center rounded-md bg-primary/5">
                      <FileText size={22} />
                    </span>
                  )}
                  <span className="block w-full truncate break-words text-center text-sm leading-relaxed text-foreground">
                    {label}
                  </span>
                  {sourceRecord && (
                    <span className="bg-primary/8 rounded-full px-2 py-0.5 text-[9px] font-semibold text-[var(--color-primary)]">
                      {SOURCE_IMAGE_LABELS[sourceRecord.source]} source image
                    </span>
                  )}
                  {pending && (
                    <span
                      className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground"
                      title="Saved by a running agent step; it joins the conversation when that step finishes."
                    >
                      Saving
                    </span>
                  )}
                </button>
                {sourcePageUrl && (
                  <a
                    href={sourcePageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center justify-center gap-1 rounded-md py-1 text-[10px] text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open source page for ${label}`}
                  >
                    Open source
                    <ExternalLink
                      className="h-2.5 w-2.5"
                      aria-hidden="true"
                    />
                  </a>
                )}
                {!editDisabled && !pending && (
                  <button
                    type="button"
                    aria-label={`Delete ${label}`}
                    title={`Delete ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteFile(filePath);
                    }}
                    className={cn(
                      "absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-card/90 text-muted-foreground shadow-xs transition-[color,background-color,opacity] duration-150 hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 motion-reduce:transition-none",
                      sourceRecord ? "opacity-100" : "opacity-0"
                    )}
                  >
                    <Trash2
                      size={14}
                      aria-hidden="true"
                    />
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
          onClose={closeFile}
          editDisabled={editDisabled}
        />
      )}
    </>
  );
}

// NOTE: the standalone `TasksFilesSidebar` panel was removed — it was never
// mounted anywhere. Only `FilesPopover` (above) is consumed, by `ChatInterface`
// and `ChatComposer`'s reference dialog.
