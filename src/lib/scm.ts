import { z } from "zod";

import { apiFetch, extractErrorMessage } from "@/lib/auth";

const publicServerValidationSchema = z
  .object({ ready: z.boolean().optional() })
  .default({});
const operatorServerValidationSchema = z
  .record(z.string(), z.unknown())
  .default({});

export const scmServerSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["gerrit", "plastic"]),
  display_name: z.string().min(1),
  enabled: z.boolean(),
  generation: z.number().int().positive(),
  validation: publicServerValidationSchema,
  credential_state: z.string().optional(),
});

/** Operator-only server details excluded from the personal token endpoint. */
export const adminScmServerSchema = scmServerSchema.extend({
  endpoint: z.string().url(),
  auth_profile: z.string().min(1),
  validation: operatorServerValidationSchema,
});

export const scmServerInputSchema = adminScmServerSchema
  .pick({
    id: true,
    provider: true,
    display_name: true,
    endpoint: true,
    auth_profile: true,
    enabled: true,
    validation: true,
  })
  .strict();

export const credentialViewSchema = z.object({
  server_id: z.string().min(1),
  configured: z.boolean(),
  masked_preview: z.string().default(""),
  validation_state: z.string(),
  credential_generation: z.number().int().positive().optional(),
  server_generation: z.number().int().positive().optional(),
});

export type ScmServerView = z.infer<typeof scmServerSchema>;
export type AdminScmServerView = z.infer<typeof adminScmServerSchema>;
export type ScmServerInput = z.infer<typeof scmServerInputSchema>;
export type CredentialView = z.infer<typeof credentialViewSchema>;

async function responseJson(res: Response, fallback: string): Promise<unknown> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      data && typeof data === "object"
        ? (data as { detail?: unknown }).detail
        : null;
    throw new Error(extractErrorMessage(detail, fallback));
  }
  return data;
}

/** Return a stable, server-specific focus key for a credential field. */
export function scmFieldKey(serverId: string): string {
  return `scm:${serverId}`;
}

/** Build a credential update only when the user entered a new secret. */
export function credentialUpdate(token: string, username: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error("Enter a personal access token");
  const normalizedUsername = username.trim();
  return {
    token: normalizedToken,
    ...(normalizedUsername ? { username: normalizedUsername } : {}),
  };
}

export async function listScmServers(
  signal?: AbortSignal
): Promise<ScmServerView[]> {
  const data = await responseJson(
    await apiFetch("/user/scm/servers", { signal }),
    "Failed to load SCM servers"
  );
  return z.array(scmServerSchema).parse(data);
}

export async function saveScmCredential(
  serverId: string,
  input: { token: string; username?: string }
): Promise<CredentialView> {
  const update = credentialUpdate(input.token, input.username ?? "");
  const data = await responseJson(
    await apiFetch(`/user/scm/credentials/${encodeURIComponent(serverId)}`, {
      method: "PUT",
      body: JSON.stringify(update),
    }),
    "Failed to save SCM credential"
  );
  return credentialViewSchema.parse(data);
}

export async function deleteScmCredential(serverId: string): Promise<void> {
  const res = await apiFetch(
    `/user/scm/credentials/${encodeURIComponent(serverId)}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    await responseJson(res, "Failed to remove SCM credential");
  }
}

export async function listAdminScmServers(
  signal?: AbortSignal
): Promise<AdminScmServerView[]> {
  const data = await responseJson(
    await apiFetch("/admin/scm/servers", { signal }),
    "Failed to load SCM server configuration"
  );
  return z.array(adminScmServerSchema).parse(data);
}

export async function saveScmServer(
  input: ScmServerInput
): Promise<AdminScmServerView> {
  const data = await responseJson(
    await apiFetch("/admin/scm/servers", {
      method: "POST",
      body: JSON.stringify(scmServerInputSchema.parse(input)),
    }),
    "Failed to save SCM server"
  );
  return adminScmServerSchema.parse(data);
}

export async function deleteScmServer(serverId: string): Promise<void> {
  const res = await apiFetch(
    `/admin/scm/servers/${encodeURIComponent(serverId)}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) await responseJson(res, "Failed to disable SCM server");
}
