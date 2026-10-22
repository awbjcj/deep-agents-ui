import { apiFetch, extractErrorMessage } from "@/lib/auth";

export interface SkillFile {
  path: string;
  content: string;
}
export interface SkillDiagnostic {
  code: string;
  message: string;
  path: string | null;
}
export interface SkillPackageInput {
  files: SkillFile[];
}
export interface ValidatedSkillPackage extends SkillPackageInput {
  name: string;
  description: string;
  total_bytes: number;
}
export interface PersonalSkill extends SkillPackageInput {
  id: string;
  name: string;
  description: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface SkillLimits {
  skill_file_bytes: number;
  supporting_file_bytes: number;
  package_bytes: number;
  files_per_package: number;
  skills_per_account: number;
  account_text_bytes: number;
  upload_bytes: number;
  path_characters: number;
  path_segments: number;
  name_characters: number;
  description_characters: number;
  worker_request_bytes: number;
  broker_response_bytes: number;
  snapshot_chunk_bytes: number;
}
export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  origin: "system" | "personal";
  availability: "available" | "name_conflict" | "unavailable";
  revision: number | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface SystemSkillResource {
  path: string;
  size_bytes: number | null;
  copyable: boolean;
  diagnostics: SkillDiagnostic[];
}
export interface SystemSkill extends SkillCatalogEntry {
  origin: "system";
  resources: SystemSkillResource[];
  diagnostics: SkillDiagnostic[];
}
export interface SkillCatalog {
  entries: SkillCatalogEntry[];
  library_revision: number;
  system_revision: string;
  limits: SkillLimits;
}
export interface SkillImportPreview {
  package: ValidatedSkillPackage;
  diagnostics: SkillDiagnostic[];
}

/** A public API failure retaining revision conflicts and resource diagnostics. */
export class SkillsApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public diagnostics: SkillDiagnostic[] = []
  ) {
    super(message);
    this.name = "SkillsApiError";
  }
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body: unknown = await response.json().catch(() => null);
  const detail =
    body && typeof body === "object" && "detail" in body
      ? body.detail
      : undefined;
  const structured =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : null;
  const diagnostics = Array.isArray(structured?.diagnostics)
    ? structured.diagnostics.filter(
        (value): value is SkillDiagnostic =>
          !!value &&
          typeof value === "object" &&
          typeof value.code === "string" &&
          typeof value.message === "string" &&
          (value.path === null || typeof value.path === "string")
      )
    : [];
  throw new SkillsApiError(
    response.status,
    typeof structured?.code === "string"
      ? structured.code
      : "skills_request_failed",
    extractErrorMessage(
      detail,
      `Could not complete the skill request (${response.status}).`
    ),
    diagnostics
  );
}

async function skillJson<T>(path: string, options?: RequestInit): Promise<T> {
  return (await checked(await apiFetch(path, options))).json() as Promise<T>;
}

export function apiGetSkills(signal?: AbortSignal): Promise<SkillCatalog> {
  return skillJson("/skills", { signal });
}

export const SKILL_CATALOG_CHANGED_EVENT = "vsda-skill-catalog-changed";

function catalogChanged<T>(result: T): T {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SKILL_CATALOG_CHANGED_EVENT));
  return result;
}
export function apiGetPersonalSkill(
  id: string,
  signal?: AbortSignal
): Promise<PersonalSkill> {
  return skillJson(`/skills/personal/${encodeURIComponent(id)}`, { signal });
}
export function apiCreatePersonalSkill(
  input: SkillPackageInput
): Promise<PersonalSkill> {
  return skillJson<PersonalSkill>("/skills/personal", {
    method: "POST",
    body: JSON.stringify({ files: input.files }),
  }).then(catalogChanged);
}
export function apiReplacePersonalSkill(
  id: string,
  input: SkillPackageInput,
  expectedRevision: number
): Promise<PersonalSkill> {
  return skillJson<PersonalSkill>(
    `/skills/personal/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        files: input.files,
        expected_revision: expectedRevision,
      }),
    }
  ).then(catalogChanged);
}
export async function apiDeletePersonalSkill(
  id: string,
  expectedRevision: number
): Promise<void> {
  await checked(
    await apiFetch(
      `/skills/personal/${encodeURIComponent(
        id
      )}?expected_revision=${encodeURIComponent(expectedRevision)}`,
      { method: "DELETE" }
    )
  );
  catalogChanged(undefined);
}
export function apiPreviewSkillImport(file: File): Promise<SkillImportPreview> {
  const body = new FormData();
  body.append("file", file);
  return skillJson("/skills/import/preview", { method: "POST", body });
}
export function apiGetSystemSkill(
  id: string,
  signal?: AbortSignal
): Promise<SystemSkill> {
  return skillJson(`/skills/system/${encodeURIComponent(id)}`, { signal });
}
export function apiReadSystemSkillFile(
  id: string,
  path: string,
  signal?: AbortSignal
): Promise<SkillFile> {
  return skillJson(
    `/skills/system/${encodeURIComponent(id)}/file?path=${encodeURIComponent(
      path
    )}`,
    { signal }
  );
}
