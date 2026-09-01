"use client";

import { useEffect } from "react";
import { reloadBypassingCache } from "@/app/components/LoadingScreen";

/**
 * Route-level error boundary.
 *
 * Without this, a render-time exception anywhere in the tree unmounts the whole
 * app and leaves a blank page (or, before hydration completes, the prerendered
 * "Loading…" markup) with no way forward other than a manual hard refresh.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled UI error:", error);
  }, [error]);

  // A failed chunk fetch is not recoverable by re-rendering — the module is
  // simply not there. Only a fresh document fetch can fix it.
  const isChunkError =
    /ChunkLoadError|Loading chunk|dynamically imported module/i.test(
      `${error.name} ${error.message}`
    );

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {isChunkError
          ? "The app couldn't load part of itself, usually because a cached copy is out of date."
          : error.message || "An unexpected error occurred."}
      </p>
      <div className="flex gap-2">
        {!isChunkError && (
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold transition-colors hover:bg-accent"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={reloadBypassingCache}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Reload app
        </button>
      </div>
    </div>
  );
}
