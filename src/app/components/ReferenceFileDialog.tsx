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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: Record<string, string>;
  onConfirm: (refs: AttachmentReference[]) => void;
}

export const ReferenceFileDialog = React.memo<Props>(
  ({ open, onOpenChange, files, onConfirm }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const entries = useMemo(() => {
      return Object.keys(files).map((path) => {
        const mime = imageMimeForPath(path);
        const thumb = mime
          ? `data:${mime};base64,${fileContentToText(files[path])}`
          : undefined;
        return {
          path,
          label: attachmentDisplayName(path),
          kind: attachmentKindForPath(path),
          thumb,
        };
      });
    }, [files]);

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
        <DialogContent className="flex h-[70vh] max-h-[70vh] min-w-[60vw] flex-col p-6">
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
                          "relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left shadow-sm transition-all duration-150",
                          isSelected
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "border-border hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:shadow-md"
                        )}
                      >
                        {entry.thumb ? (
                          <img
                            src={entry.thumb}
                            alt={entry.label}
                            className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/5 text-primary/70">
                            <FileText className="h-5 w-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {entry.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.kind}
                          </span>
                        </span>
                        {isSelected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
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
        </DialogContent>
      </Dialog>
    );
  }
);

ReferenceFileDialog.displayName = "ReferenceFileDialog";
