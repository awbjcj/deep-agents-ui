export const SOURCE_IMAGE_SOURCES = ["jira", "polarion", "confluence"] as const;

export type SourceImageSource = (typeof SOURCE_IMAGE_SOURCES)[number];
export type SourceImageFetchScope = "embedded" | "all";

export const SOURCE_IMAGE_LABELS: Record<SourceImageSource, string> = {
  jira: "Jira",
  polarion: "Polarion",
  confluence: "Confluence",
};

export interface SourceImagePolicy {
  enabled: boolean;
  default_scope: SourceImageFetchScope;
  allow_all: boolean;
}

export interface SourceImagePolicyResponse extends SourceImagePolicy {
  tier: string;
  source: SourceImageSource;
}

export interface SourceImageRef {
  attachment_id: string;
  artifact_path: string;
}

export interface SourceImageSerializableAttachment {
  path: string;
  filename: string;
  kind: "image" | "document";
  detail?: string;
  imageUrl: string | null;
  source_image_ref?: SourceImageRef;
}

export interface SourceImageMessageAttachment {
  kind: "image" | "document";
  source_image_ref?: SourceImageRef;
}

export interface SourceImageRecord extends SourceImageRef {
  state_files_key: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  source: SourceImageSource;
  source_instance: string;
  item_id: string;
  source_page_url: string;
  source_attachment_id: string;
  source_version: string | null;
  content_digest: string;
  embedded: boolean;
  created_at: string;
  optimized_copy: boolean;
}

export interface EffectiveSourceImagePolicy extends SourceImagePolicy {
  effective_enabled: boolean;
}

export type SourceImagePolicyMap = Record<
  SourceImageSource,
  EffectiveSourceImagePolicy
>;

export type SourceImagePolicyEdit =
  | { field: "enabled"; value: boolean }
  | { field: "allow_all"; value: boolean }
  | { field: "default_scope"; value: SourceImageFetchScope };

export type SourceImageRecordMap = Record<
  string,
  SourceImageRecord | null | undefined
>;

export interface SourceImageRemovalState<FilesValue = unknown> {
  files: Record<string, FilesValue>;
  records: Record<string, SourceImageRecord>;
}

/** Keep source-image bytes transient while retaining the live state reference. */
export function serializeAttachment<
  T extends SourceImageSerializableAttachment
>(attachment: T): T {
  return attachment.source_image_ref
    ? { ...attachment, imageUrl: null }
    : { ...attachment };
}

/**
 * Remove surplus inline payloads associated with historical source refs.
 * Current messages contain inline bytes only for ordinary image attachments,
 * so an equal payload/ordinary-image count is already safe.
 */
export function omitSourceImagePayloads(
  imageUrls: string[],
  attachments: SourceImageMessageAttachment[]
): string[] {
  const images = attachments.filter(
    (attachment) => attachment.kind === "image"
  );
  const ordinaryCount = images.filter(
    (attachment) => !attachment.source_image_ref
  ).length;
  let surplusSourcePayloads = Math.max(0, imageUrls.length - ordinaryCount);
  if (surplusSourcePayloads === 0) return [...imageUrls];

  const safe: string[] = [];
  let urlIndex = 0;
  for (const attachment of images) {
    const url = imageUrls[urlIndex];
    if (!url) break;
    urlIndex += 1;
    if (attachment.source_image_ref && surplusSourcePayloads > 0) {
      surplusSourcePayloads -= 1;
      continue;
    }
    safe.push(url);
  }
  return [...safe, ...imageUrls.slice(urlIndex)];
}

/** Drop tombstoned metadata and records whose backing thread file is gone. */
export function reconcileSourceImageRecords(
  records: SourceImageRecordMap,
  files: Record<string, unknown>
): Record<string, SourceImageRecord> {
  const live: Record<string, SourceImageRecord> = {};
  for (const [attachmentId, record] of Object.entries(records)) {
    if (!record || !(record.artifact_path in files)) continue;
    live[attachmentId] = record;
  }
  return live;
}

/** Stage a narrow optimistic removal and retain the complete rollback snapshot. */
export function stageSourceImageRemoval<FilesValue>(
  files: Record<string, FilesValue>,
  records: Record<string, SourceImageRecord>,
  record: SourceImageRecord
): {
  previous: SourceImageRemovalState<FilesValue>;
  next: SourceImageRemovalState<FilesValue>;
} {
  const nextFiles = { ...files };
  const nextRecords = { ...records };
  delete nextFiles[record.artifact_path];
  delete nextRecords[record.attachment_id];
  return {
    previous: { files, records },
    next: { files: nextFiles, records: nextRecords },
  };
}

/** Restore the selected source after a failed delete without reverting peers. */
export function restoreSourceImageRemoval<FilesValue>(
  currentFiles: Record<string, FilesValue>,
  currentRecords: Record<string, SourceImageRecord>,
  previous: SourceImageRemovalState<FilesValue>,
  record: SourceImageRecord
): SourceImageRemovalState<FilesValue> {
  const files = { ...currentFiles };
  const records = { ...currentRecords };
  if (record.artifact_path in previous.files) {
    files[record.artifact_path] = previous.files[record.artifact_path]!;
  }
  if (record.attachment_id in previous.records) {
    records[record.attachment_id] = previous.records[record.attachment_id]!;
  }
  return { files, records };
}

/** Return a safe source-page link for rendering, or null for other schemes. */
export function safeSourcePageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Apply one admin edit while preserving the policy invariant. */
export function applyPolicyEdit(
  policy: SourceImagePolicy,
  edit: SourceImagePolicyEdit
): SourceImagePolicy {
  const current: SourceImagePolicy = {
    enabled: policy.enabled,
    default_scope: policy.default_scope,
    allow_all: policy.allow_all,
  };
  if (edit.field === "enabled") {
    return { ...current, enabled: edit.value };
  }
  if (edit.field === "allow_all") {
    return {
      ...current,
      allow_all: edit.value,
      default_scope: edit.value ? current.default_scope : "embedded",
    };
  }
  return {
    ...current,
    default_scope: edit.value,
    allow_all: edit.value === "all" ? true : current.allow_all,
  };
}
