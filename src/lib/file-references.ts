import { shiftSpans, spansOverlap, type TextSpan } from "./reference-spans";
import type {
  SourceImageRecord,
  SourceImageRef,
  SourceImageSource,
} from "./source-images";
import {
  attachmentDisplayName,
  attachmentKindForPath,
  fileContentToText,
  imageMimeForPath,
  type UploadKind,
} from "./uploads";

/** A conversation file that can be mentioned with `@`. */
export interface FileReferenceEntry {
  path: string;
  label: string;
  kind: UploadKind;
  source?: SourceImageRecord;
}

/** Offsets cover the visible `@label` token. */
export interface FileReference extends TextSpan {
  path: string;
  label: string;
}

export interface FileQuery extends TextSpan {
  query: string;
}

export const MAX_FILE_SUGGESTIONS = 50;

const boundaryBefore = /[\s([{]/u;
const nameCharacter = /[\p{L}\p{M}\p{N}_-]/u;

function intact(text: string, reference: FileReference): boolean {
  if (
    !Number.isInteger(reference.start) ||
    !Number.isInteger(reference.end) ||
    reference.start < 0 ||
    reference.end > text.length ||
    reference.end <= reference.start
  )
    return false;
  const next = String.fromCodePoint(text.codePointAt(reference.end) ?? 0);
  return (
    text.slice(reference.start, reference.end) === `@${reference.label}` &&
    (reference.start === 0 || boundaryBefore.test(text[reference.start - 1])) &&
    (reference.end === text.length ||
      (!nameCharacter.test(next) && !/[\\/@]/u.test(next)))
  );
}

/** List thread files (uploads, saved artifacts, and source images) once. */
export function fileReferenceEntries(
  files: Record<string, unknown>,
  sourceImageAttachments: Record<string, SourceImageRecord>
): FileReferenceEntry[] {
  const sources = new Map(
    Object.values(sourceImageAttachments).map((record) => [
      record.artifact_path,
      record,
    ])
  );
  return Object.keys(files).map((path) => ({
    path,
    label: attachmentDisplayName(path),
    kind: attachmentKindForPath(path),
    source: sources.get(path),
  }));
}

/** Build the attachment chip payload for a referenced thread file. */
export function fileAttachmentReference(
  entry: FileReferenceEntry,
  files: Record<string, unknown>
): {
  path: string;
  filename: string;
  kind: UploadKind;
  thumb?: string;
  source_image_ref?: SourceImageRef;
  source?: SourceImageSource;
} {
  const mime = imageMimeForPath(entry.path);
  return {
    path: entry.path,
    filename: entry.label,
    kind: entry.kind,
    ...(mime
      ? {
          thumb: `data:${mime};base64,${fileContentToText(files[entry.path])}`,
        }
      : {}),
    ...(entry.source
      ? {
          source_image_ref: {
            attachment_id: entry.source.attachment_id,
            artifact_path: entry.source.artifact_path,
          },
          source: entry.source.source,
        }
      : {}),
  };
}

/**
 * Find the `@` query ending at the caret. Queries may contain spaces (file
 * names often do) but cannot start with one, and never span another reference.
 */
export function activeFileQuery(
  text: string,
  caret: number,
  references: TextSpan[],
  blocked: TextSpan[] = []
): FileQuery | null {
  const spans = [...references, ...blocked];
  if (spans.some((span) => caret > span.start && caret <= span.end))
    return null;
  const match = /(?:^|[\s([{])@(?!\s)([^\r\n@]*)$/u.exec(text.slice(0, caret));
  if (!match) return null;
  const query = { start: caret - match[1].length - 1, end: caret };
  if (spans.some((span) => spansOverlap(span, query))) return null;
  return { ...query, query: match[1] };
}

/** Rank label prefixes first, then label and path substrings. */
export function searchFiles(
  entries: FileReferenceEntry[],
  query: string
): FileReferenceEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  const rank = (entry: FileReferenceEntry) => {
    const label = entry.label.toLocaleLowerCase();
    if (label.startsWith(needle)) return 0;
    if (label.includes(needle)) return 1;
    return entry.path.toLocaleLowerCase().includes(needle) ? 2 : -1;
  };
  return entries
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter((item) => item.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.entry.label.localeCompare(b.entry.label) ||
        a.entry.path.localeCompare(b.entry.path)
    )
    .slice(0, MAX_FILE_SUGGESTIONS)
    .map((item) => item.entry);
}

/** Preserve mentions outside an edit; editing a token makes it plain text. */
export function reconcileFileReferences(
  before: string,
  after: string,
  references: FileReference[]
): FileReference[] {
  return shiftSpans(before, after, references, intact);
}

export function insertFileReference(
  text: string,
  query: FileQuery,
  entry: FileReferenceEntry,
  references: FileReference[]
) {
  const token = `@${entry.label}`;
  const suffix = text.slice(query.end);
  const separator = suffix.startsWith(" ") ? "" : " ";
  const next = text.slice(0, query.start) + token + separator + suffix;
  const reference: FileReference = {
    path: entry.path,
    label: entry.label,
    start: query.start,
    end: query.start + token.length,
  };
  return {
    text: next,
    caret: reference.end + 1,
    references: [
      ...reconcileFileReferences(text, next, references),
      reference,
    ].sort((a, b) => a.start - b.start),
  };
}
