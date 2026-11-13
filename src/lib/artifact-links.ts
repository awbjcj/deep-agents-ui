import type { FileItem } from "@/app/types/types";
import { fileViewKind, type FileViewKind } from "@/lib/file-kind";
import { fileMetadata } from "@/lib/file-downloads";
import {
  safeSourcePageUrl,
  SOURCE_IMAGE_LABELS,
  type SourceImageRecord,
  type SourceImageSource,
} from "@/lib/source-images";
import { attachmentDisplayName, fileContentToText } from "@/lib/uploads";

/** Literal text, or a conversation file path found inside it. */
export type TextPart = { text: string } | { path: string; raw: string };

// `<path>` may contain spaces; a bare path ends at whitespace or a quote. A
// bare path must start a token so URLs and nested paths are left alone.
const ARTIFACT_PATH =
  /<(\/_artifacts\/[^<>\n]+)>|(?<![\w/.:%~-])(\/_artifacts\/[^\s<>"'`]+)/g;
const TRAILING_PUNCTUATION = /[.,;:)\]'"]+$/;
const ARTIFACT_PREFIX = "/_artifacts/";

function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Split text into literal runs and `/_artifacts/...` paths. Joining every
 * part's `text` or `raw` reproduces the input exactly, so callers can keep
 * the surrounding text literal and only make the paths interactive.
 */
export function splitArtifactPaths(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last && "text" in last) last.text += value;
    else parts.push({ text: value });
  };
  let cursor = 0;
  for (const match of text.matchAll(ARTIFACT_PATH)) {
    const start = match.index;
    const bracketed = match[1];
    let raw: string;
    let rawStart: number;
    if (bracketed !== undefined) {
      raw = bracketed;
      rawStart = start + 1;
    } else {
      raw = match[2]!.replace(TRAILING_PUNCTUATION, "");
      rawStart = start;
    }
    if (raw.length <= ARTIFACT_PREFIX.length) continue;
    pushText(text.slice(cursor, rawStart));
    parts.push({ path: decodePath(raw), raw });
    cursor = rawStart + raw.length;
  }
  pushText(text.slice(cursor));
  return parts;
}

/** Provenance for a source document saved into the conversation. */
export interface SourceAttachmentRecord {
  source: string;
  item_id: string;
  attachment_id: string;
  filename: string;
  original_path: string;
  readable_path: string;
  source_page_url: string;
}

export interface ResolvedFile {
  file: FileItem | null;
  kind: FileViewKind;
  filename: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
}

function sourceLabel(source: string): string {
  return SOURCE_IMAGE_LABELS[source as SourceImageSource] ?? source;
}

/**
 * Resolve a conversation file path to the viewer's file, its preview kind,
 * a readable name and, when provenance has a safe URL, its source page. A
 * readable Markdown copy resolves to the same source as its original.
 */
export function resolveConversationFile(
  path: string,
  files: Record<string, unknown>,
  images: Record<string, SourceImageRecord>,
  documents: Record<string, SourceAttachmentRecord>
): ResolvedFile {
  const value = Object.hasOwn(files, path) ? files[path] : undefined;
  const image = Object.values(images).find(
    (record) => record?.artifact_path === path
  );
  const document =
    (Object.hasOwn(documents, path) ? documents[path] : undefined) ??
    Object.values(documents).find((record) => record?.readable_path === path);
  const metadata = fileMetadata(value);
  const mimeType = metadata.mimeType ?? image?.mime_type;
  const isOriginal = document?.original_path === path;
  const filename =
    image?.filename ||
    (isOriginal ? document?.filename : undefined) ||
    metadata.filename ||
    attachmentDisplayName(path);
  const provenance = image ?? document;
  const sourceUrl = provenance
    ? safeSourcePageUrl(provenance.source_page_url)
    : null;
  const label = sourceUrl && provenance ? sourceLabel(provenance.source) : null;
  const file: FileItem | null =
    value === undefined || value === null
      ? null
      : {
          path,
          content: fileContentToText(value),
          ...metadata,
          mimeType,
          filename,
          sourceImage: image,
          source: sourceUrl && label ? { url: sourceUrl, label } : undefined,
        };
  return {
    file,
    kind: fileViewKind(path, mimeType, metadata.encoding),
    filename,
    sourceUrl,
    sourceLabel: label,
  };
}
