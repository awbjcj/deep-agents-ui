import { getDeploymentUrl } from "@/lib/config";
import { getAuthUser } from "@/lib/auth";

export type UploadKind = "image" | "document";

export interface UploadImagePayload {
  media_type: string;
  data_b64: string;
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  kind: UploadKind;
  content_type: string;
  byte_size: number;
  artifact_path: string | null;
  state_files_key: string | null;
  markdown_chars: number;
  engine: string | null;
  image: UploadImagePayload | null;
  warning: string | null;
}

/**
 * Lightweight descriptor attached to a human message's `additional_kwargs`
 * so the agent (and the UI) know which thread files the turn refers to.
 * `detail` is an optional human-readable hint such as "1200 chars, engine=docintel".
 */
export interface MessageAttachment {
  path: string;
  name: string;
  kind: UploadKind;
  detail?: string;
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Return the image MIME type for a path, or null when it is not an image. */
export function imageMimeForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_BY_EXT[ext] ?? null;
}

/** Classify a thread file path as an image or a document by extension. */
export function attachmentKindForPath(path: string): UploadKind {
  return imageMimeForPath(path) ? "image" : "document";
}

/** Friendly label for a file key: basename with the upload id prefix stripped. */
export function attachmentDisplayName(path: string): string {
  const base = path.split("/").pop() || path;
  const sep = base.indexOf("__");
  return sep >= 0 ? base.slice(sep + 2) : base;
}

export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_MAX_PER_SEND = 5;

export const SUPPORTED_DOC_EXTS = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "html",
  "htm",
  "txt",
  "md",
  "msg",
] as const;
export const SUPPORTED_IMAGE_EXTS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
] as const;

export const ACCEPT_ATTR = [
  ...SUPPORTED_DOC_EXTS.map((e) => `.${e}`),
  ...SUPPORTED_IMAGE_EXTS.map((e) => `.${e}`),
].join(",");

function deploymentBase(): string {
  const url = getDeploymentUrl();
  if (!url) {
    throw new Error("Deployment URL is not configured");
  }
  return url.replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const user = getAuthUser();
  if (!user?.access_token) return {};
  return { Authorization: `Bearer ${user.access_token}` };
}

export async function uploadFile(
  threadId: string,
  file: File,
  signal?: AbortSignal
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(
    `${deploymentBase()}/api/threads/${encodeURIComponent(threadId)}/uploads`,
    {
      method: "POST",
      body: form,
      headers: { ...authHeaders() },
      signal,
    }
  );
  if (!resp.ok) {
    const detail =
      (await resp
        .json()
        .then((d) => d?.detail)
        .catch(() => undefined)) ?? `Upload failed (${resp.status})`;
    throw new Error(detail);
  }
  return (await resp.json()) as UploadResponse;
}

export async function deleteUpload(
  threadId: string,
  stateFilesKey: string
): Promise<void> {
  const resp = await fetch(
    `${deploymentBase()}/api/threads/${encodeURIComponent(
      threadId
    )}/uploads/${encodeURIComponent(stateFilesKey)}`,
    { method: "DELETE", headers: authHeaders() }
  );
  if (!resp.ok) {
    const detail =
      (await resp
        .json()
        .then((d) => d?.detail)
        .catch(() => undefined)) ?? `Delete failed (${resp.status})`;
    throw new Error(detail);
  }
}
