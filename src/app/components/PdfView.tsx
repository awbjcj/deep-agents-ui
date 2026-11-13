"use client";

import React, { useEffect, useMemo, useState } from "react";
import { base64ToBytes } from "@/lib/spreadsheet";
import { UNAVAILABLE_PREVIEW_MESSAGE } from "./SpreadsheetView";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Decoded bytes when the content is a PDF, otherwise null. */
function pdfBytes(content: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bytes = base64ToBytes(content);
    return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)
      ? bytes
      : null;
  } catch {
    return null;
  }
}

/**
 * Show a base64 PDF with the browser's own viewer. Content that is not a PDF
 * never reaches a frame. The blob URL lives only as long as this view and is
 * revoked on unmount or when the content changes.
 */
export function PdfView({
  content,
  title = "PDF preview",
}: {
  content: string;
  title?: string;
}) {
  const bytes = useMemo(() => pdfBytes(content), [content]);
  const [url, setUrl] = useState<{ bytes: Uint8Array; url: string } | null>(
    null
  );

  useEffect(() => {
    if (!bytes) return;
    const objectUrl = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" })
    );
    setUrl({ bytes, url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes]);

  if (!bytes)
    return (
      <p className="text-sm text-muted-foreground">
        {UNAVAILABLE_PREVIEW_MESSAGE}
      </p>
    );
  if (url?.bytes !== bytes)
    return (
      <p
        role="status"
        className="text-sm text-muted-foreground"
      >
        Loading PDF…
      </p>
    );
  // No `sandbox`: Chrome's PDF viewer refuses to load in sandboxed frames.
  // The frame only ever holds a blob typed application/pdf whose bytes start
  // with %PDF-, rendered by the browser's own sandboxed PDF viewer.
  return (
    <iframe
      src={url.url}
      title={title}
      className="h-full w-full rounded-md border border-border bg-background"
    />
  );
}
