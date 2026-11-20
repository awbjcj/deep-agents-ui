"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectivityLoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading connectivity settings"
      aria-busy="true"
      className="border-border space-y-3 rounded-lg border p-4"
    >
      <div className="bg-muted h-4 w-32 animate-pulse rounded motion-reduce:animate-none" />
      <div className="bg-muted h-10 animate-pulse rounded-md motion-reduce:animate-none" />
      <div className="bg-muted h-10 animate-pulse rounded-md motion-reduce:animate-none" />
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
      className="border-border bg-muted/30 flex flex-wrap items-center gap-3 rounded-lg border p-4"
    >
      <AlertCircle
        className="text-muted-foreground h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <p className="text-foreground min-w-0 flex-1 basis-40 text-xs leading-relaxed">
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
