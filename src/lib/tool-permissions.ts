import { apiFetch, extractErrorMessage, type Role } from "./auth";

export type ToolTier = Role;

export interface ToolCatalogEntry {
  id: string;
  label: string;
  group: string;
  description: string;
  prerequisites: string | null;
}

export interface TierToolPermissions {
  tier: ToolTier;
  allowed_tool_ids: string[];
  revision: number;
}

export interface AdminToolPermissions {
  catalog: ToolCatalogEntry[];
  tiers: Record<ToolTier, TierToolPermissions>;
}

export interface UserToolPermissions {
  catalog: ToolCatalogEntry[];
  tier: ToolTier;
  tier_revision: string;
  selection_revision: number;
  allowed_tool_ids: string[];
  selected_tool_ids: string[];
  effective_tool_ids: string[];
  blocked_tool_ids: string[];
}

export interface TierToolPermissionsUpdate {
  allowed_tool_ids: string[];
  expected_revision: number;
}

export interface UserToolPermissionsUpdate {
  selected_tool_ids: string[];
  expected_selection_revision: number;
  expected_tier_revision: string;
}

export class ToolPermissionsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ToolPermissionsApiError";
    this.status = status;
    this.code = code;
  }
}

function canonicalIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

async function requestToolPermissions<T>(
  path: string,
  options: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(path, { ...options, signal });
  if (response.ok) return (await response.json()) as T;

  let detail: unknown;
  let code: string | undefined;
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
    };
    detail = payload.detail;
    if (
      detail &&
      typeof detail === "object" &&
      typeof (detail as { code?: unknown }).code === "string"
    ) {
      code = (detail as { code: string }).code;
    }
  } catch {
    detail = undefined;
  }

  const fallback =
    response.status === 503
      ? "Tool permissions are unavailable."
      : response.status === 409
      ? "Tool permissions changed. Refresh and review before saving again."
      : "Tool permissions request failed.";
  throw new ToolPermissionsApiError(
    extractErrorMessage(detail, fallback),
    response.status,
    code
  );
}

export function apiGetAdminToolPermissions(
  signal?: AbortSignal
): Promise<AdminToolPermissions> {
  return requestToolPermissions(
    "/admin/tool-permissions",
    { method: "GET" },
    signal
  );
}

export function apiSetTierToolPermissions(
  tier: ToolTier,
  allowedToolIds: readonly string[],
  expectedRevision: number,
  signal?: AbortSignal
): Promise<TierToolPermissions> {
  const payload: TierToolPermissionsUpdate = {
    allowed_tool_ids: canonicalIds(allowedToolIds),
    expected_revision: expectedRevision,
  };
  return requestToolPermissions(
    `/admin/tool-permissions/${tier}`,
    { method: "PUT", body: JSON.stringify(payload) },
    signal
  );
}

export function apiGetUserToolPermissions(
  signal?: AbortSignal
): Promise<UserToolPermissions> {
  return requestToolPermissions(
    "/user/tool-permissions",
    { method: "GET" },
    signal
  );
}

export function apiSetUserToolPermissions(
  selectedToolIds: readonly string[],
  expectedSelectionRevision: number,
  expectedTierRevision: string,
  signal?: AbortSignal
): Promise<UserToolPermissions> {
  const payload: UserToolPermissionsUpdate = {
    selected_tool_ids: canonicalIds(selectedToolIds),
    expected_selection_revision: expectedSelectionRevision,
    expected_tier_revision: expectedTierRevision,
  };
  return requestToolPermissions(
    "/user/tool-permissions",
    { method: "PUT", body: JSON.stringify(payload) },
    signal
  );
}

export function sameToolIds(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const a = canonicalIds(left);
  const b = canonicalIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function canToggleTool(
  toolId: string,
  selectedIds: readonly string[],
  allowedIds: readonly string[]
): boolean {
  return selectedIds.includes(toolId) || allowedIds.includes(toolId);
}

export function mergeRetainedSelection(
  selectedIds: readonly string[],
  toolId: string,
  selected: boolean
): string[] {
  const next = new Set(selectedIds);
  if (selected) next.add(toolId);
  else next.delete(toolId);
  return canonicalIds([...next]);
}

export function canSaveToolPermissions({
  hasSnapshot,
  dirty,
  saving,
  policyReviewRequired,
}: {
  hasSnapshot: boolean;
  dirty: boolean;
  saving: boolean;
  policyReviewRequired: boolean;
}): boolean {
  return hasSnapshot && dirty && !saving && !policyReviewRequired;
}
