"use client";

import React from "react";
import {
  File as FileIcon,
  Image as ImageIcon,
  Link2,
  Loader2,
  X,
} from "lucide-react";
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
  const isReady = item.phase === "ready";
  const isReference = item.phase === "reference";

  const filename = isReady
    ? item.meta.filename
    : isReference
    ? item.filename
    : item.file.name;

  const isImage = isReady
    ? item.meta.kind === "image"
    : isReference
    ? item.kind === "image"
    : /\.(png|jpe?g|gif|webp)$/i.test(item.file.name);

  const size = isReady
    ? item.meta.byte_size
    : isReference
    ? null
    : item.file.size;

  const thumbnailSrc = isReady
    ? item.meta.kind === "image" && item.meta.image
      ? `data:${item.meta.image.media_type};base64,${item.meta.image.data_b64}`
      : null
    : isReference
    ? item.thumb ?? null
    : null;

  const status =
    item.phase === "uploading"
      ? "Uploading…"
      : item.phase === "error"
      ? item.error
      : isReference
      ? "Linked from this conversation"
      : size !== null
      ? humanSize(size)
      : "Ready";

  return (
    <div
      role="listitem"
      className="hover:border-primary/30 group inline-flex max-w-full items-center gap-2 rounded-lg border border-border/80 bg-card p-2 text-xs shadow-sm transition-[border-color,background-color] duration-150 data-[state=error]:border-destructive/40 data-[state=error]:bg-destructive/5"
      data-state={item.phase}
    >
      {item.phase === "uploading" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={filename}
          className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-border"
        />
      ) : isImage ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[var(--color-primary)]">
          <ImageIcon className="h-4 w-4" />
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileIcon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 max-w-[180px] leading-tight">
        <span
          className="block truncate font-medium text-foreground"
          title={filename}
        >
          {filename}
        </span>
        <span
          className={
            item.phase === "error"
              ? "mt-1 block truncate text-[10px] text-destructive"
              : "mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground"
          }
          title={status}
        >
          {isReference && (
            <Link2
              className="h-2.5 w-2.5 shrink-0"
              aria-hidden="true"
            />
          )}
          {status}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${filename}`}
        onClick={() => onRemove(item.localId)}
        className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});

AttachmentChip.displayName = "AttachmentChip";
