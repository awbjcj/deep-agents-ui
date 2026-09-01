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
        className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive"
      >
        {error}
      </div>
    );
  }
  if (loading) {
    return (
      <div
        aria-busy="true"
        className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Loading shelf files
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">No files on this shelf</p>
        <p className="mt-1 text-xs text-muted-foreground">
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
          className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/15 p-3"
        >
          <FileText
            className="mt-0.5 h-4 w-4 flex-none text-[var(--aptiv-orange)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs font-semibold"
              title={file.filename}
            >
              {file.filename}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatBytes(file.byte_size)} · Uploaded by{" "}
              {file.uploaded_by} · {new Date(file.uploaded_at).toLocaleString()}
            </p>
            {file.warning && (
              <p className="mt-1 text-[10px] text-warning">{file.warning}</p>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-none text-destructive hover:bg-destructive/10 hover:text-destructive"
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
