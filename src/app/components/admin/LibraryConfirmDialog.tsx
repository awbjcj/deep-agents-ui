"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LibraryConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmationLabel: string;
  isPending?: boolean;
  /**
   * Optional block rendered under the description. Long enumerations (every
   * index a prune would remove) belong here, where they can scroll, rather
   * than joined into the description as an unreadable paragraph.
   */
  details?: ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function LibraryConfirmDialog({
  open,
  title,
  description,
  confirmationLabel,
  isPending = false,
  details,
  onOpenChange,
  onConfirm,
}: LibraryConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive">
            <AlertTriangle
              className="h-4 w-4"
              aria-hidden="true"
            />
          </div>
          <DialogTitle className="break-anywhere">{title}</DialogTitle>
          {/* Shelf ids are 60+ characters with no spaces, so the description
              must be allowed to break mid-token or it overflows the dialog. */}
          <DialogDescription className="leading-relaxed break-anywhere">
            {description}
          </DialogDescription>
        </DialogHeader>
        {details}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Working…" : confirmationLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
