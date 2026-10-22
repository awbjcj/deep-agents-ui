"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectivityLoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading connectivity settings"
      aria-busy="true"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <span className="sr-only">Loading connectivity settings</span>
    </div>
  );
}

export function ConnectivityLoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-4"
    >
      <AlertCircle
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 basis-40 text-xs leading-relaxed text-foreground">
        {message}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="h-10"
      >
        <RotateCcw aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}
