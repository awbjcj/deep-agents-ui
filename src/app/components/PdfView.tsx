"use client";

import React, { useEffect, useState } from "react";
import { base64ToBytes } from "@/lib/spreadsheet";
import { UNAVAILABLE_PREVIEW_MESSAGE } from "./SpreadsheetView";

/**
 * Show a base64 PDF with the browser's own viewer. The blob URL lives only
 * as long as this view and is revoked on unmount or when the content changes.
 */
export function PdfView({
  content,
  title = "PDF preview",
}: {
  content: string;
  title?: string;
}) {
  const [state, setState] = useState<{
    content: string;
    url: string | null;
  } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(
        new Blob([base64ToBytes(content)], { type: "application/pdf" })
      );
    } catch {
      url = null;
    }
    setState({ content, url });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [content]);

  if (state?.content !== content)
    return (
      <p
        role="status"
        className="text-sm text-muted-foreground"
      >
        Loading PDF…
      </p>
    );
  if (!state.url)
    return (
      <p className="text-sm text-muted-foreground">
        {UNAVAILABLE_PREVIEW_MESSAGE}
      </p>
    );
  return (
    <iframe
      src={state.url}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      className="h-full w-full rounded-md border border-border bg-background"
    />
  );
}
