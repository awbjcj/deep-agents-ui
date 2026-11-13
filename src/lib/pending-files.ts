import type { SourceImageRecord } from "@/lib/source-images";
import type { SourceAttachmentRecord } from "@/lib/artifact-links";

/**
 * Files a delegated subagent has saved but the root thread has not yet
 * received.
 *
 * Deep Agents subagents run inside the supervisor's `task` tool, so their
 * `state.files` writes (saved Jira/Polarion/Confluence images, attachments,
 * offloaded results) only reach the root thread state when the task returns.
 * While the subagent is still running, or paused on a nested approval, the
 * root `files` channel does not contain them. The chat stream does carry the
 * subagent's node updates under a `tools:<id>` namespace, so the Files panel
 * overlays those writes until the root state catches up.
 */
export interface PendingSubagentFiles {
  files: Record<string, unknown>;
  records: Record<string, SourceImageRecord>;
  /** Source-document provenance keyed by original path. */
  documents: Record<string, SourceAttachmentRecord>;
}

export const EMPTY_PENDING_FILES: PendingSubagentFiles = Object.freeze({
  files: Object.freeze({}) as Record<string, unknown>,
  records: Object.freeze({}) as Record<string, SourceImageRecord>,
  documents: Object.freeze({}) as Record<string, SourceAttachmentRecord>,
}) as PendingSubagentFiles;

type Delta = {
  files: Record<string, unknown>;
  records: Record<string, SourceImageRecord | null>;
  /** Present only when the update wrote `source_attachment_records`. */
  documents?: Record<string, SourceAttachmentRecord | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when a stream namespace belongs to a subagent launched by `task`. */
export function isSubagentNamespace(namespace: string[] | undefined): boolean {
  return (
    Array.isArray(namespace) &&
    namespace.some((segment) => segment.startsWith("tools:"))
  );
}

/**
 * Extract `files`, `source_image_attachments` and `source_attachment_records`
 * writes from one namespaced
 * `updates` event. Root-namespace events return null: the root stream values
 * already carry those writes.
 */
export function subagentFileDelta(
  data: unknown,
  namespace: string[] | undefined
): Delta | null {
  if (!isSubagentNamespace(namespace) || !isRecord(data)) return null;
  const delta: Delta = { files: {}, records: {} };
  let found = false;
  for (const nodeUpdate of Object.values(data)) {
    const updates = Array.isArray(nodeUpdate) ? nodeUpdate : [nodeUpdate];
    for (const update of updates) {
      if (!isRecord(update)) continue;
      if (isRecord(update.files)) {
        Object.assign(delta.files, update.files);
        found = true;
      }
      if (isRecord(update.source_image_attachments)) {
        Object.assign(
          delta.records,
          update.source_image_attachments as Delta["records"]
        );
        found = true;
      }
      if (isRecord(update.source_attachment_records)) {
        delta.documents = Object.assign(
          delta.documents ?? {},
          update.source_attachment_records as NonNullable<Delta["documents"]>
        );
        found = true;
      }
    }
  }
  return found ? delta : null;
}

/** Merge one delta, honouring `null` tombstones like the server reducer. */
export function applyPendingDelta(
  pending: PendingSubagentFiles,
  delta: Delta
): PendingSubagentFiles {
  const files = { ...pending.files };
  const records = { ...pending.records };
  const documents = { ...pending.documents };
  for (const [path, value] of Object.entries(delta.files)) {
    if (value == null) delete files[path];
    else files[path] = value;
  }
  for (const [id, record] of Object.entries(delta.records)) {
    if (record == null) delete records[id];
    else records[id] = record;
  }
  for (const [path, record] of Object.entries(delta.documents ?? {})) {
    if (record == null) delete documents[path];
    else documents[path] = record;
  }
  return { files, records, documents };
}

/**
 * Drop overlay entries the root thread now owns. Once the run is settled
 * (not streaming and not paused for review) the root state is authoritative,
 * so the whole overlay is discarded. Returns the same object when unchanged.
 */
export function prunePendingFiles(
  pending: PendingSubagentFiles,
  rootFiles: Record<string, unknown>,
  settled: boolean
): PendingSubagentFiles {
  const pendingPaths = Object.keys(pending.files);
  const recordIds = Object.keys(pending.records);
  const documentPaths = Object.keys(pending.documents);
  if (
    pendingPaths.length === 0 &&
    recordIds.length === 0 &&
    documentPaths.length === 0
  )
    return pending;
  if (settled) return EMPTY_PENDING_FILES;
  const files: Record<string, unknown> = {};
  for (const path of pendingPaths) {
    if (!(path in rootFiles)) files[path] = pending.files[path];
  }
  const records: Record<string, SourceImageRecord> = {};
  for (const id of recordIds) {
    const record = pending.records[id]!;
    if (record.artifact_path in files) records[id] = record;
  }
  // A document record stays while either of its files is still pending.
  const documents: Record<string, SourceAttachmentRecord> = {};
  for (const path of documentPaths) {
    const record = pending.documents[path]!;
    if (record.original_path in files || record.readable_path in files)
      documents[path] = record;
  }
  const unchanged =
    Object.keys(files).length === pendingPaths.length &&
    Object.keys(records).length === recordIds.length &&
    Object.keys(documents).length === documentPaths.length;
  return unchanged ? pending : { files, records, documents };
}

/** Root files win over overlay entries for the same path. */
export function mergePendingFiles<T>(
  rootFiles: Record<string, T>,
  pending: PendingSubagentFiles
): Record<string, T> {
  if (Object.keys(pending.files).length === 0) return rootFiles;
  return { ...(pending.files as Record<string, T>), ...rootFiles };
}

/**
 * Remove unchanged overlay entries from a map derived from the displayed files,
 * so an edit of an ordinary file never copies subagent-owned entries into the
 * root thread (or its optimistic override).
 */
export function withoutPendingFiles<T>(
  next: Record<string, T>,
  previousRoot: Record<string, unknown>,
  pending: PendingSubagentFiles
): Record<string, T> {
  const rootNext: Record<string, T> = {};
  for (const [path, value] of Object.entries(next)) {
    const overlay = pending.files[path];
    if (!(path in previousRoot) && overlay !== undefined && overlay === value) {
      continue;
    }
    rootNext[path] = value;
  }
  return rootNext;
}
