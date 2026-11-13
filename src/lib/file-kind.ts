/**
 * Decide how a conversation file is previewed. The MIME type recorded with
 * the file wins over its extension because agent-saved originals keep a
 * storage-key prefix and are not always named after their real format.
 */
export type FileViewKind =
  | "image"
  | "csv"
  | "tsv"
  | "xlsx"
  | "pdf"
  | "markdown"
  | "json"
  | "text"
  | "binary";

/** Larger files are offered as a download instead of being parsed in the tab. */
export const PREVIEW_MAX_BYTES = 10_000_000;

// SVG is deliberately absent: it can carry script, so it is never previewed.
const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const KIND_BY_MIME: Record<string, FileViewKind> = {
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsx",
  "application/pdf": "pdf",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "application/json": "json",
};

const KIND_BY_EXTENSION: Record<string, FileViewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  csv: "csv",
  tsv: "tsv",
  xlsx: "xlsx",
  xls: "xlsx",
  xlsm: "xlsx",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  json: "json",
};

export function fileViewKind(
  path: string,
  mimeType?: string,
  encoding?: string
): FileViewKind {
  const mime = (mimeType || "").split(";")[0]!.trim().toLowerCase();
  if (mime) {
    if (IMAGE_MIMES.has(mime)) return "image";
    const byMime = KIND_BY_MIME[mime];
    if (byMime) return byMime;
  }
  const base = path.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  const byExtension = KIND_BY_EXTENSION[extension];
  if (byExtension) return byExtension;
  return encoding === "base64" ? "binary" : "text";
}

/** Decoded size of stored file content, without decoding it. */
export function contentByteSize(content: string, encoding?: string): number {
  if (encoding === "base64") {
    const compact = content.replace(/\s/g, "");
    const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
  }
  return new TextEncoder().encode(content).length;
}
