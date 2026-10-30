"use client";

import { Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChannelMeta } from "./channel-meta";

/** Confirm before forgetting a linked identity; focus returns to the trigger. */
export function UnlinkDialog({
  meta,
  open,
  active,
  onOpenChange,
  onConfirm,
}: {
  meta: ChannelMeta | null;
  open: boolean;
  /** Whether unlinking also pauses the account's live connection. */
  active: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlink {meta?.label}?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            VSDA stops using this {meta?.short} account
            {active ? " and pauses delivery" : ""}. Tasks already running
            continue in the web conversation. You can link {meta?.short} again
            at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              className="min-h-11"
            >
              Keep linked
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            className="min-h-11 border-error-strong text-error hover:border-error-strong hover:bg-error-secondary hover:text-error"
            onClick={onConfirm}
          >
            <Unlink aria-hidden="true" />
            Unlink {meta?.short}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
