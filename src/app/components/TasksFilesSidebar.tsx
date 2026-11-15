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
import {
  resolveConversationFile,
  type SourceAttachmentRecord,
} from "@/lib/artifact-links";
import { cn } from "@/lib/utils";
import {
  safeSourcePageUrl,
  SOURCE_IMAGE_LABELS,
  type SourceImageRecord,
} from "@/lib/source-images";

const NO_PENDING_PATHS: ReadonlySet<string> = new Set();
const NO_SOURCE_ATTACHMENT_RECORDS: Record<string, SourceAttachmentRecord> = {};

export function FilesPopover({
  files,
  pendingFilePaths = NO_PENDING_PATHS,
  setFiles,
  sourceImageAttachments,
  sourceAttachmentRecords = NO_SOURCE_ATTACHMENT_RECORDS,
  removeSourceImage,
  editDisabled,
}: {
  files: Record<string, string>;
  /** Files a running subagent saved that the thread has not received yet. */
  pendingFilePaths?: ReadonlySet<string>;
  setFiles: (files: Record<string, string>) => Promise<void>;
  sourceImageAttachments: Record<string, SourceImageRecord>;
  /** Saved source documents keyed by original path, for "Open in" links. */
  sourceAttachmentRecords?: Record<string, SourceAttachmentRecord>;
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
  const selectedFile = useMemo(
    () =>
      selectedPath === null
        ? null
        : resolveConversationFile(
            selectedPath,
            files,
            sourceImageAttachments,
            sourceAttachmentRecords
          ).file,
    [selectedPath, files, sourceImageAttachments, sourceAttachmentRecords]
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
          <p className="text-muted-foreground text-xs">No files created yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,256px),1fr))] gap-2">
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
                className="group relative min-w-0"
              >
                <button
                  type="button"
                  onClick={() => setSelectedPath(filePath)}
                  title={filePath}
                  className={cn(
                    "focus-visible:ring-ring flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border px-2 py-3 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
                    sourceRecord
                      ? "border-primary/20 hover:border-primary/45 bg-primary/[0.035] hover:bg-primary/6 hover:shadow-md"
                      : "hover:border-primary/40 border-border bg-(--color-file-button) hover:bg-(--color-file-button-hover) hover:shadow-md"
                  )}
                >
                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={label}
                      className="ring-border h-16 w-16 rounded-lg object-cover ring-1"
                    />
                  ) : (
                    <span className="text-primary/70 bg-primary/5 flex h-16 w-16 items-center justify-center rounded-md">
                      <FileText size={22} />
                    </span>
                  )}
                  <span className="text-foreground block w-full truncate text-center text-sm leading-relaxed wrap-break-word">
                    {label}
                  </span>
                  {sourceRecord && (
                    <span className="bg-primary/8 rounded-full px-2 py-0.5 text-[9px] font-semibold text-(--color-primary)">
                      {SOURCE_IMAGE_LABELS[sourceRecord.source]} source image
                    </span>
                  )}
                  {pending && (
                    <span
                      className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[9px] font-semibold"
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
                    className="text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-ring mt-1 flex items-center justify-center gap-1 rounded-md py-1 text-[10px] focus-visible:ring-2 focus-visible:outline-none"
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
                      "border-border/60 bg-card/90 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md border shadow-xs transition-[color,background-color,border-color,opacity] duration-150 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
                      !sourceRecord &&
                        "[@media(hover:hover)_and_(pointer:fine)]:opacity-0"
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
