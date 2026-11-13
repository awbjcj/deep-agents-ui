"use client";

import { useEffect } from "react";
import { reloadBypassingCache } from "@/app/reloadBypassingCache";

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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold">
        {isChunkError
          ? "The app couldn’t finish loading"
          : "Something went wrong"}
      </h1>
      {!isChunkError && error.message && (
        <p className="max-w-md break-words text-sm text-muted-foreground">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {!isChunkError && (
          <button
            type="button"
            onClick={reset}
            className="min-h-touch rounded-full border border-border px-5 py-2 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={reloadBypassingCache}
          className="min-h-touch rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Reload app
        </button>
      </div>
    </main>
  );
}
