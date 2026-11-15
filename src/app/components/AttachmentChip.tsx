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
import { SOURCE_IMAGE_LABELS } from "@/lib/source-images";

interface Props {
  item: AttachmentState;
  onRemove: (localId: string) => void;
  disabled?: boolean;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentChip = React.memo<Props>(
  ({ item, onRemove, disabled }) => {
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
        ? (item.thumb ?? null)
        : null;

    const status =
      item.phase === "uploading"
        ? "Uploading…"
        : item.phase === "error"
          ? item.error
          : isReference
            ? item.source
              ? `${SOURCE_IMAGE_LABELS[item.source]} source image`
              : "Linked from this conversation"
            : size !== null
              ? humanSize(size)
              : "Ready";

    return (
      <div
        role="listitem"
        className="hover:border-primary/30 group border-border/80 bg-card data-[state=error]:border-destructive/40 data-[state=error]:bg-destructive/5 inline-flex max-w-full items-center gap-2 rounded-lg border p-2 text-xs shadow-sm transition-[border-color,background-color] duration-150"
        data-state={item.phase}
      >
        {item.phase === "uploading" ? (
          <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        ) : thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={filename}
            className="ring-border h-8 w-8 shrink-0 rounded object-cover ring-1"
          />
        ) : isImage ? (
          <span className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-(--color-primary)">
            <ImageIcon className="h-4 w-4" />
          </span>
        ) : (
          <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
            <FileIcon className="h-4 w-4" />
          </span>
        )}
        <span className="max-w-[180px] min-w-0 leading-tight">
          <span
            className="text-foreground block truncate font-medium"
            title={filename}
          >
            {filename}
          </span>
          <span
            className={
              item.phase === "error"
                ? "text-destructive mt-1 block truncate text-xs"
                : "text-muted-foreground mt-1 flex items-center gap-1 truncate text-xs"
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
          disabled={disabled}
          title={`Remove ${filename}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
);

AttachmentChip.displayName = "AttachmentChip";
