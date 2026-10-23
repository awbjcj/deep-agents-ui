import { z } from "zod";
import { apiFetch, extractErrorMessage } from "@/lib/auth";

const nonnegativeInteger = z.int().nonnegative();
const skillFileSchema = z.object({ path: z.string(), content: z.string() });
const skillDiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().nullable().default(null),
});
const skillPackageSchema = z.object({ files: z.array(skillFileSchema) });
const validatedPackageSchema = skillPackageSchema.extend({
  name: z.string(),
  description: z.string(),
  total_bytes: nonnegativeInteger,
});
const personalSkillSchema = skillPackageSchema.extend({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  revision: nonnegativeInteger,
  created_at: z.string(),
  updated_at: z.string(),
});
const skillLimitsSchema = z.object({
  skill_file_bytes: z.int().positive(),
  supporting_file_bytes: z.int().positive(),
  package_bytes: z.int().positive(),
  files_per_package: z.int().positive(),
  skills_per_account: z.int().positive(),
  account_text_bytes: z.int().positive(),
  upload_bytes: z.int().positive(),
  path_characters: z.int().positive(),
  path_segments: z.int().positive(),
  name_characters: z.int().positive(),
  description_characters: z.int().positive(),
  worker_request_bytes: z.int().positive(),
  broker_response_bytes: z.int().positive(),
  snapshot_chunk_bytes: z.int().positive(),
});
const catalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  origin: z.enum(["system", "personal"]),
  availability: z.enum(["available", "name_conflict", "unavailable"]),
  revision: nonnegativeInteger.nullable().default(null),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});
const systemResourceSchema = z.object({
  path: z.string(),
  size_bytes: nonnegativeInteger.nullable().default(null),
  copyable: z.boolean(),
  diagnostics: z.array(skillDiagnosticSchema).default([]),
});
const systemSkillSchema = catalogEntrySchema.extend({
  origin: z.literal("system"),
  resources: z.array(systemResourceSchema),
  diagnostics: z.array(skillDiagnosticSchema).default([]),
});
const skillCatalogSchema = z.object({
  entries: z.array(catalogEntrySchema),
  library_revision: nonnegativeInteger,
  system_revision: z.string(),
  limits: skillLimitsSchema,
});
const importPreviewSchema = z.object({
  package: validatedPackageSchema,
  diagnostics: z.array(skillDiagnosticSchema).default([]),
});

// Keep runtime validation and public TypeScript contracts in one place.
// Object schemas accept additive server fields without rejecting newer responses.
export type SkillFile = z.infer<typeof skillFileSchema>;
export type SkillDiagnostic = z.infer<typeof skillDiagnosticSchema>;
export type SkillPackageInput = z.infer<typeof skillPackageSchema>;
export type ValidatedSkillPackage = z.infer<typeof validatedPackageSchema>;
export type PersonalSkill = z.infer<typeof personalSkillSchema>;
export type SkillLimits = z.infer<typeof skillLimitsSchema>;
export type SkillCatalogEntry = z.infer<typeof catalogEntrySchema>;
export type SystemSkillResource = z.infer<typeof systemResourceSchema>;
export type SystemSkill = z.infer<typeof systemSkillSchema>;
export type SkillCatalog = z.infer<typeof skillCatalogSchema>;
export type SkillImportPreview = z.infer<typeof importPreviewSchema>;
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

async function skillJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await checked(await apiFetch(path, options));
  const invalidResponse = () =>
    new SkillsApiError(
      response.status,
      "invalid_skill_response",
      "The server returned an invalid skill response. Reload the library before continuing."
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw invalidResponse();
  }
  const result = schema.safeParse(body);
  if (!result.success) throw invalidResponse();
  return result.data;
}

export function apiGetSkills(signal?: AbortSignal): Promise<SkillCatalog> {
  return skillJson("/skills", skillCatalogSchema, { signal });
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
  return skillJson(
    `/skills/personal/${encodeURIComponent(id)}`,
    personalSkillSchema,
    { signal }
  );
}
export function apiCreatePersonalSkill(
  input: SkillPackageInput
): Promise<PersonalSkill> {
  return skillJson("/skills/personal", personalSkillSchema, {
    method: "POST",
    body: JSON.stringify({ files: input.files }),
  }).then(catalogChanged);
}
export function apiReplacePersonalSkill(
  id: string,
  input: SkillPackageInput,
  expectedRevision: number
): Promise<PersonalSkill> {
  return skillJson(
    `/skills/personal/${encodeURIComponent(id)}`,
    personalSkillSchema,
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
  return skillJson("/skills/import/preview", importPreviewSchema, {
    method: "POST",
    body,
  });
}
export function apiGetSystemSkill(
  id: string,
  signal?: AbortSignal
): Promise<SystemSkill> {
  return skillJson(
    `/skills/system/${encodeURIComponent(id)}`,
    systemSkillSchema,
    { signal }
  );
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
    skillFileSchema,
    { signal }
  );
}
