import { getConfig } from "@/lib/config";
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
  const cfg = getConfig();
  if (!cfg?.deploymentUrl) {
    throw new Error("Deployment URL is not configured");
  }
  return cfg.deploymentUrl.replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const user = getAuthUser();
  if (!user?.access_token) return {};
  return { Authorization: `Bearer ${user.access_token}` };
}

export async function uploadFile(
  threadId: string,
  file: File,
  signal?: AbortSignal,
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
    },
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
  stateFilesKey: string,
): Promise<void> {
  const resp = await fetch(
    `${deploymentBase()}/api/threads/${encodeURIComponent(
      threadId,
    )}/uploads/${encodeURIComponent(stateFilesKey)}`,
    { method: "DELETE", headers: authHeaders() },
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
