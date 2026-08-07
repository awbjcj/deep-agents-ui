"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for failures in the root layout itself (where `error.tsx`
 * cannot render because the layout never mounted). It must render its own
 * <html>/<body>, and cannot rely on app CSS being loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal UI error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            The app failed to start
          </h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 16px" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set("_cb", String(Date.now()));
                window.location.replace(url.toString());
              } catch {
                reset();
              }
            }}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: 9999,
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              background: "#ff6a13",
              color: "#fff",
            }}
          >
            Reload app
          </button>
        </div>
      </body>
    </html>
  );
}
