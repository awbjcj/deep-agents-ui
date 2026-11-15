"use client";

import { FileText, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryFile } from "@/lib/library-admin";
import { formatBytes } from "@/lib/library-format";

interface LibraryShelfFileListProps {
  files: LibraryFile[];
  loading: boolean;
  error: string | null;
  mutationsDisabled: boolean;
  onDelete: (file: LibraryFile) => void;
}

/** Present the loading, error, empty, and populated shelf-file states. */
export function LibraryShelfFileList({
  files,
  loading,
  error,
  mutationsDisabled,
  onDelete,
}: LibraryShelfFileListProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="border-destructive/25 bg-destructive/5 text-destructive rounded-md border p-3 text-xs"
      >
        {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div
        aria-busy="true"
        className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-xs"
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Loading shelf files
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="border-border bg-muted/20 rounded-lg border border-dashed px-4 py-8 text-center">
        <FileText className="text-muted-foreground mx-auto h-5 w-5" />
        <p className="mt-2 text-sm font-semibold">No files on this shelf</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Upload one or more documents to make them searchable.
        </p>
      </div>
    );
  }
  return (
    <ul
      className="max-h-[45vh] space-y-2 overflow-y-auto pr-1"
      aria-label="Shelf files"
    >
      {files.map((file) => (
        <li
          key={file.file_id}
          className="border-border/70 bg-muted/15 flex items-start gap-3 rounded-lg border p-3"
        >
          <FileText
            className="mt-0.5 h-4 w-4 flex-none text-(--aptiv-orange)"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-semibold"
              title={file.filename}
            >
              {file.filename}
            </p>
            <p className="text-muted-foreground mt-1 text-[10px]">
              {formatBytes(file.byte_size)} · Uploaded by {file.uploaded_by} ·{" "}
              {new Date(file.uploaded_at).toLocaleString()}
            </p>
            {file.status === "pending" && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
                <Loader2
                  className="h-3 w-3 animate-spin"
                  aria-hidden="true"
                />
                Converting in the sync job
              </p>
            )}
            {file.status === "failed" && (
              <p className="text-destructive mt-1 text-[10px] font-semibold">
                Conversion failed; not searchable
              </p>
            )}
            {file.warning && (
              <p className="text-warning mt-1 text-[10px]">{file.warning}</p>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 w-7 flex-none"
            aria-label={`Delete ${file.filename}`}
            disabled={mutationsDisabled}
            onClick={() => onDelete(file)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
