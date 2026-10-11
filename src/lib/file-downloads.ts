/** Preserve binary FileData when constructing previews and downloads. */
export function fileMetadata(value: unknown) {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    encoding:
      data.encoding === "base64" ? ("base64" as const) : ("utf-8" as const),
    mimeType: typeof data.mime_type === "string" ? data.mime_type : undefined,
    filename: typeof data.filename === "string" ? data.filename : undefined,
  };
}

export function fileBlob(
  content: string,
  encoding: string,
  mimeType?: string
): Blob {
  if (encoding === "base64") {
    const bytes = Uint8Array.from(atob(content), (character) =>
      character.charCodeAt(0)
    );
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  }
  return new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.split(/[\\/]/).pop() || "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
