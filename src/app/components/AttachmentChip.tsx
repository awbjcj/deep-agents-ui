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

  return (
    <div
      role="listitem"
      className="group inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-xs shadow-sm transition-colors hover:border-primary/30 data-[state=error]:border-destructive/40 data-[state=error]:bg-destructive/5"
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
      {size !== null ? (
        <span className="text-muted-foreground">{humanSize(size)}</span>
      ) : isReference ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-[var(--color-primary)]"
          title="References an existing thread file"
        >
          <Link2 className="h-3 w-3" />
          linked
        </span>
      ) : null}
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
        className="-mr-0.5 ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});

AttachmentChip.displayName = "AttachmentChip";
