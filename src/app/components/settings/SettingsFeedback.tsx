"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Preserve the form's shape while its saved values are loading. */
export function SettingsLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("space-y-3 py-5", compact && "py-2")}
    >
      <span className="sr-only">Loading settings</span>
      <div
        aria-hidden="true"
        className="space-y-3 motion-safe:animate-pulse"
      >
        <div className="bg-muted h-3 w-1/3 rounded" />
        <div className="bg-muted h-10 rounded-md" />
        {!compact && <div className="bg-muted h-10 rounded-md" />}
      </div>
    </div>
  );
}

/** Keep a failed read distinct from a genuinely empty configuration. */
export function SettingsLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-border space-y-3 rounded-lg border p-4 text-sm"
    >
      <p>{message}</p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="min-h-touch"
      >
        Retry loading settings
      </Button>
    </div>
  );
}
