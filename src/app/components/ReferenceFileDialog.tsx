"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Check, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  attachmentDisplayName,
  attachmentKindForPath,
  fileContentToText,
  imageMimeForPath,
} from "@/lib/uploads";
import type { AttachmentReference } from "@/app/hooks/useAttachments";
import {
  SOURCE_IMAGE_LABELS,
  type SourceImageRecord,
} from "@/lib/source-images";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: Record<string, string>;
  sourceImageAttachments: Record<string, SourceImageRecord>;
  onConfirm: (refs: AttachmentReference[]) => void;
}

export const ReferenceFileDialog = React.memo<Props>(
  ({ open, onOpenChange, files, sourceImageAttachments, onConfirm }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const entries = useMemo(() => {
      const sourceByPath = new Map(
        Object.values(sourceImageAttachments).map((record) => [
          record.artifact_path,
          record,
        ])
      );
      return Object.keys(files).map((path) => {
        const mime = imageMimeForPath(path);
        const sourceRecord = sourceByPath.get(path);
        const thumb = mime
          ? `data:${mime};base64,${fileContentToText(files[path])}`
          : undefined;
        return {
          path,
          label: attachmentDisplayName(path),
          kind: attachmentKindForPath(path),
          thumb,
          sourceRecord,
        };
      });
    }, [files, sourceImageAttachments]);

    const toggle = useCallback((path: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    }, []);

    const close = useCallback(
      (nextOpen: boolean) => {
        if (!nextOpen) setSelected(new Set());
        onOpenChange(nextOpen);
      },
      [onOpenChange]
    );

    const confirm = useCallback(() => {
      const refs: AttachmentReference[] = entries
        .filter((e) => selected.has(e.path))
        .map((e) => ({
          path: e.path,
          filename: e.label,
          kind: e.kind,
          thumb: e.thumb,
          ...(e.sourceRecord
            ? {
                source_image_ref: {
                  attachment_id: e.sourceRecord.attachment_id,
                  artifact_path: e.sourceRecord.artifact_path,
                },
                source: e.sourceRecord.source,
              }
            : {}),
        }));
      if (refs.length > 0) onConfirm(refs);
      setSelected(new Set());
      onOpenChange(false);
    }, [entries, selected, onConfirm, onOpenChange]);

    const selectedCount = selected.size;

    return (
      <Dialog
        open={open}
        onOpenChange={close}
      >
        <DialogContent className="flex h-[min(70dvh,680px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] min-w-0 max-w-4xl flex-col p-4 sm:min-w-[60vw] sm:p-6">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Reference an existing file
          </DialogTitle>
          <span
            className="aptiv-rule"
            aria-hidden="true"
          />
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Pick one or more files already in this conversation to attach to
            your next message. Referencing a file does not re-upload it.
          </DialogDescription>

          <div className="mt-3 min-h-0 flex-1 overflow-hidden">
            {entries.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No files in this conversation yet. Upload a file first.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full rounded-md">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 p-1">
                  {entries.map((entry) => {
                    const isSelected = selected.has(entry.path);
                    return (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => toggle(entry.path)}
                        title={entry.path}
                        aria-pressed={isSelected}
                        className={cn(
                          "relative flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left shadow-sm transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "hover:border-primary/40 border-border hover:bg-primary/5 hover:shadow-md"
                        )}
                      >
                        {entry.thumb ? (
                          <img
                            src={entry.thumb}
                            alt={entry.label}
                            className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                          />
                        ) : (
                          <span className="text-primary/70 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/5">
                            <FileText className="h-5 w-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {entry.label}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 truncate text-xs text-muted-foreground",
                              entry.sourceRecord
                                ? "bg-primary/8 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary)]"
                                : "block"
                            )}
                          >
                            {entry.sourceRecord
                              ? `${
                                  SOURCE_IMAGE_LABELS[entry.sourceRecord.source]
                                } source image`
                              : entry.kind}
                          </span>
                        </span>
                        {isSelected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {selectedCount === 0
                ? "No files selected"
                : `${selectedCount} file${
                    selectedCount > 1 ? "s" : ""
                  } selected`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => close(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirm}
                disabled={selectedCount === 0}
              >
                {selectedCount > 0
                  ? `Add ${selectedCount} reference${
                      selectedCount > 1 ? "s" : ""
                    }`
                  : "Add references"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

ReferenceFileDialog.displayName = "ReferenceFileDialog";
