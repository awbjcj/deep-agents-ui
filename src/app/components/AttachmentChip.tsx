"use client";

import React from "react";
import { File as FileIcon, Image as ImageIcon, Loader2, X } from "lucide-react";
import type { AttachmentState } from "@/app/hooks/useAttachments";

interface Props {
  item: AttachmentState;
  onRemove: (localId: string) => void;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentChip = React.memo<Props>(({ item, onRemove }) => {
  const isImage =
    item.phase === "ready"
      ? item.meta.kind === "image"
      : /\.(png|jpe?g|gif|webp)$/i.test(item.file.name);

  const filename = item.phase === "ready" ? item.meta.filename : item.file.name;
  const size = item.phase === "ready" ? item.meta.byte_size : item.file.size;

  const thumbnailSrc =
    item.phase === "ready" && item.meta.kind === "image" && item.meta.image
      ? `data:${item.meta.image.media_type};base64,${item.meta.image.data_b64}`
      : null;

  return (
    <div
      role="listitem"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm data-[state=error]:border-destructive/40 data-[state=error]:bg-destructive/5"
      data-state={item.phase}
    >
      {item.phase === "uploading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={filename}
          className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-border"
        />
      ) : isImage ? (
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="max-w-[160px] truncate font-medium">{filename}</span>
      <span className="text-muted-foreground">{humanSize(size)}</span>
      {item.phase === "error" && (
        <span
          className="text-destructive"
          title={item.error}
        >
          error
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={() => onRemove(item.localId)}
        className="rounded-md p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});

AttachmentChip.displayName = "AttachmentChip";
