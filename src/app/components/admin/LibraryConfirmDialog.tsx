"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  /**
   * When set, the operator must type this exact text before confirming.
   *
   * Reserved for actions whose blast radius scales with a number the operator
   * should have to restate — a batch rebuild across sixty-eight shelves is a
   * very different act from one across two, and an ordinary confirm button
   * looks identical in both cases.
   */
  requiredPhrase?: string;
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
  requiredPhrase,
  onOpenChange,
  onConfirm,
}: LibraryConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  // Reset between openings so a previously satisfied phrase cannot arm the
  // button for a different, larger selection.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const phraseSatisfied = !requiredPhrase || typed.trim() === requiredPhrase;

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
        {requiredPhrase ? (
          <div className="space-y-1.5">
            <Label htmlFor="library-confirm-phrase">
              Type <span className="font-mono">{requiredPhrase}</span> to
              confirm
            </Label>
            <Input
              id="library-confirm-phrase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              disabled={isPending}
            />
          </div>
        ) : null}
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
            disabled={isPending || !phraseSatisfied}
          >
            {isPending ? "Working…" : confirmationLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
