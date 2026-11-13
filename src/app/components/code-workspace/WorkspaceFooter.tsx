"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";

export function WorkspaceFooter({
  children,
  summary,
  error,
  notice,
  onRelease,
  releaseDisabled,
  confirmRelease,
  onCancelRelease,
}: {
  children: ReactNode;
  summary: string;
  error?: string | null;
  notice?: string;
  onRelease?: () => Promise<boolean>;
  releaseDisabled: boolean;
  confirmRelease: boolean;
  onCancelRelease: () => void;
}) {
  const keepButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmRelease) keepButton.current?.focus();
  }, [confirmRelease]);
  return (
    <footer className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3 sm:px-6">
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
        >
          {notice}
        </p>
      )}
      {confirmRelease ? (
        <div className="space-y-3">
          <p className="text-sm">
            Release the most recent checkout? Prepare it again to continue
            analysis. Saved reports are kept.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              ref={keepButton}
              type="button"
              variant="outline"
              className="min-h-touch"
              onClick={onCancelRelease}
            >
              Keep checkout
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-touch"
              disabled={releaseDisabled}
              onClick={async () => {
                if (await onRelease?.()) onCancelRelease();
              }}
            >
              Release checkout
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
            {summary}
          </p>
          <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0 sm:justify-end [&_button]:h-auto [&_button]:min-w-0 [&_button]:flex-1 [&_button]:basis-24 [&_button]:whitespace-normal [&_button]:py-2 sm:[&_button]:flex-none sm:[&_button]:basis-auto">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
              >
                Back to chat
              </Button>
            </DialogClose>
            {children}
          </div>
        </div>
      )}
    </footer>
  );
}
