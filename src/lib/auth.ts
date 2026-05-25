export type Role = "user" | "developer" | "admin";

export interface AuthUser {
  user_id: string;
  username: string;
  role: Role;
  email?: string | null;
  access_token: string;
}

const AUTH_KEY = "deep-agent-auth";
export { AUTH_KEY };

function base64UrlDecode(str: string): string {
  // Replace base64url chars with standard base64 equivalents
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to a multiple of 4
  const pad = base64.length % 4;
  if (pad) {
    base64 += "=".repeat(4 - pad);
  }
  return atob(base64);
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return true;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (!payload.exp) return false;
    // Expired if current time is past the exp claim (with 60s buffer)
    return Date.now() >= (payload.exp - 60) * 1000;
  } catch {
    return true;
  }
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return null;
  try {
    const user: AuthUser = JSON.parse(stored);
    if (user.access_token && isTokenExpired(user.access_token)) {
      clearAuthUser();
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function clearAuthUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_KEY);
  // Dispatch a storage event so same-window listeners (e.g. AuthProvider) can react
  window.dispatchEvent(
    new StorageEvent("storage", { key: AUTH_KEY, newValue: null })
  );
}

const API_BASE = "/api";

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = getAuthUser();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (user?.access_token) {
    headers["Authorization"] = `Bearer ${user.access_token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearAuthUser();
  }
  return res;
}

function extractErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI Pydantic validation error format: [{loc, msg, type}]
    return detail.map((e: { msg?: string }) => e.msg || String(e)).join("; ");
  }
  return fallback;
}

export interface RegisterInitResponse {
  pending_registration_id: string;
  email: string;
  expires_in_minutes: number;
}

export async function apiRegisterInit(payload: {
  username: string;
  email: string;
  password: string;
}): Promise<RegisterInitResponse> {
  const res = await apiFetch("/auth/register/init", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data.detail, "Registration failed"));
  }
  return res.json();
}

export async function apiRegisterVerify(payload: {
  pending_registration_id: string;
  verification_code: string;
}): Promise<AuthUser> {
  const res = await apiFetch("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data.detail, "Verification failed"));
  }
  const data = await res.json();
  const user: AuthUser = {
    user_id: data.user_id,
    username: data.username,
    role: data.role,
    email: data.email,
    access_token: data.access_token,
  };
  saveAuthUser(user);
  return user;
}

export async function apiForgotPassword(email: string): Promise<{ sent: boolean }> {
  const res = await apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data.detail, "Could not send reset email"));
  }
  return res.json();
}

export async function apiLogin(
  username: string,
  password: string
): Promise<AuthUser> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data.detail, "Login failed"));
  }
  const data = await res.json();
  const user: AuthUser = {
    user_id: data.user_id,
    username: data.username,
    role: data.role,
    email: data.email,
    access_token: data.access_token,
  };
  saveAuthUser(user);
  return user;
}

export interface UserTokens {
  graph_api_token_preview: string;
  jira_api_token_preview: string;
  polarion_asux_api_token_preview: string;
  polarion_prod1_api_token_preview: string;
  confluence_api_token_preview: string;
  graph_api_token_updated_at: string;
  jira_api_token_updated_at: string;
  polarion_asux_api_token_updated_at: string;
  polarion_prod1_api_token_updated_at: string;
  confluence_api_token_updated_at: string;
  graph_api_token_time_gap: string;
  jira_api_token_time_gap: string;
  polarion_asux_api_token_time_gap: string;
  polarion_prod1_api_token_time_gap: string;
  confluence_api_token_time_gap: string;
}

export async function apiGetTokens(): Promise<UserTokens> {
  const res = await apiFetch("/user/tokens");
  if (!res.ok) {
    throw new Error("Failed to fetch tokens");
  }
  return res.json();
}

export interface UserNotification {
  id: number;
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  action_label: string | null;
  action_target: string | null;
  action_params: Record<string, string> | null;
  created_at: string;
  snoozed_until: string | null;
}

export interface TokenUpdateResponse extends UserTokens {
  cleared_notifications: UserNotification[];
}

export async function apiUpdateTokens(
  tokens: {
    graph_api_token?: string;
    jira_api_token?: string;
    polarion_asux_api_token?: string;
    polarion_prod1_api_token?: string;
    confluence_api_token?: string;
  }
): Promise<TokenUpdateResponse> {
  const res = await apiFetch("/user/tokens", {
    method: "PUT",
    body: JSON.stringify(tokens),
  });
  if (!res.ok) {
    throw new Error("Failed to update tokens");
  }
  return res.json();
}

// --- User Notifications ---

export async function apiListNotifications(): Promise<UserNotification[]> {
  const res = await apiFetch("/user/notifications");
  if (!res.ok) {
    throw new Error("Failed to fetch notifications");
  }
  return res.json();
}

export async function apiAcknowledgeNotification(id: number): Promise<void> {
  const res = await apiFetch(`/user/notifications/${id}/acknowledge`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to acknowledge notification");
  }
}

export async function apiSnoozeNotification(
  id: number,
  hours = 1
): Promise<void> {
  const res = await apiFetch(`/user/notifications/${id}/snooze`, {
    method: "POST",
    body: JSON.stringify({ hours }),
  });
  if (!res.ok) {
    throw new Error("Failed to snooze notification");
  }
}

// --- Role utilities ---

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

// --- Profile ---

export interface UserProfile {
  user_id: string;
  username: string;
  role: Role;
  email?: string | null;
  has_graph_api_token: boolean;
  has_jira_api_token: boolean;
}

export async function apiGetProfile(): Promise<UserProfile> {
  const res = await apiFetch("/user/profile");
  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }
  return res.json();
}

// --- Admin: user management ---

export interface AdminUser {
  user_id: string;
  username: string;
  role: Role;
}

export async function apiListUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  const res = await apiFetch("/admin/users", { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }
  const data: { users: AdminUser[] } = await res.json();
  return data.users;
}

export async function apiUpdateUserRole(
  userId: string,
  role: Role
): Promise<AdminUser> {
  const res = await apiFetch(`/admin/users/${userId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to update role");
  }
  return res.json();
}

// --- Admin: run mode ---

export type RunMode = "remote" | "gateway" | "proxy";

export interface RunModeInfo {
  run_mode: RunMode;
  run_mode_updated_at: string;
  run_mode_time_gap: string;
}

export async function apiGetRunMode(): Promise<RunModeInfo> {
  const res = await apiFetch("/admin/run-mode");
  if (!res.ok) {
    throw new Error("Failed to fetch run mode");
  }
  return res.json();
}

export async function apiSetRunMode(mode: RunMode): Promise<RunModeInfo> {
  const res = await apiFetch("/admin/run-mode", {
    method: "PUT",
    body: JSON.stringify({ run_mode: mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to set run mode");
  }
  return res.json();
}

// --- Tier model allowlist ---

export interface TierModelEntry {
  provider: string;
  model: string;
}

export interface ModelEntry extends TierModelEntry {
  supports_effort: boolean;
  efforts: string[];
  supports_thinking: boolean;
}

export interface TierAllowlist {
  tier: Role;
  models: TierModelEntry[];
}

export interface AllowedModelsResponse {
  models: ModelEntry[];
}

export async function apiGetTierModels(tier: Role): Promise<TierAllowlist> {
  const res = await apiFetch(`/admin/tier-models/${tier}`);
  if (!res.ok) {
    throw new Error("Failed to fetch tier models");
  }
  return res.json();
}

export async function apiGetAllowedModels(): Promise<AllowedModelsResponse> {
  const res = await apiFetch("/user/allowed-models");
  if (!res.ok) {
    throw new Error("Failed to fetch allowed models");
  }
  return res.json();
}

export async function apiSetTierModels(
  tier: Role,
  models: TierModelEntry[]
): Promise<TierAllowlist> {
  const res = await apiFetch(`/admin/tier-models/${tier}`, {
    method: "PUT",
    body: JSON.stringify({ models }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to set tier models");
  }
  return res.json();
}

export async function apiSetAllTierModels(payload: {
  user: TierModelEntry[];
  developer: TierModelEntry[];
  admin: TierModelEntry[];
}): Promise<Record<Role, TierModelEntry[]>> {
  const res = await apiFetch("/admin/tier-models", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to save tier models");
  }
  const raw = (await res.json()) as unknown;
  return normalizeTierMap(raw, payload);
}

function isTierEntryArray(value: unknown): value is TierModelEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v !== null &&
        typeof v === "object" &&
        typeof (v as TierModelEntry).provider === "string" &&
        typeof (v as TierModelEntry).model === "string"
    )
  );
}

/**
 * Tolerates either of two response shapes from PUT /admin/tier-models:
 *   {user: TierModelEntry[], developer: ..., admin: ...}      (flat)
 *   {user: {tier, models}, developer: ..., admin: ...}        (nested, mirrors GET)
 * Falls back to the request payload if the backend returns something unrecognized,
 * so a successful save never crashes the TiersSection on render.
 */
function normalizeTierMap(
  raw: unknown,
  fallback: { user: TierModelEntry[]; developer: TierModelEntry[]; admin: TierModelEntry[] }
): Record<Role, TierModelEntry[]> {
  const out: Record<Role, TierModelEntry[]> = { user: [], developer: [], admin: [] };
  const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null);
  for (const role of ["user", "developer", "admin"] as Role[]) {
    const slot = obj?.[role];
    if (isTierEntryArray(slot)) {
      out[role] = slot;
    } else if (slot && typeof slot === "object" && "models" in slot) {
      const nested = (slot as { models?: unknown }).models;
      out[role] = isTierEntryArray(nested) ? nested : fallback[role];
    } else {
      out[role] = fallback[role];
    }
  }
  return out;
}

// --- Per-user model selection ---

export type ModelPreset = "economy" | "balanced" | "deep_work";

export interface EffectiveModelSelection {
  provider: string | null;
  model: string | null;
  effort: string | null;
  thinking: boolean | null;
  max_tokens: number;
}

export interface UserModelSelection extends EffectiveModelSelection {
  preset: ModelPreset;
  effective: EffectiveModelSelection;
}

export async function apiGetUserModel(): Promise<UserModelSelection> {
  const res = await apiFetch("/user/model");
  if (!res.ok) {
    throw new Error("Failed to fetch user model");
  }
  return res.json();
}

export async function apiSetUserModel(payload: {
  preset: ModelPreset;
}): Promise<UserModelSelection>;
export async function apiSetUserModel(payload: {
  provider: string;
  model: string;
  effort?: string | null;
  thinking?: boolean | null;
  max_tokens?: number | null;
}): Promise<UserModelSelection>;
export async function apiSetUserModel(
  provider: string,
  model: string
): Promise<UserModelSelection>;
export async function apiSetUserModel(
  payloadOrProvider:
    | string
    | {
        preset: ModelPreset;
      }
    | {
        provider: string;
        model: string;
        effort?: string | null;
        thinking?: boolean | null;
        max_tokens?: number | null;
      },
  model?: string
): Promise<UserModelSelection> {
  const payload =
    typeof payloadOrProvider === "string"
      ? {
          provider: payloadOrProvider,
          model: model ?? "",
          effort: null,
          thinking: null,
        }
      : payloadOrProvider;
  const res = await apiFetch("/user/model", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to set user model");
  }
  return res.json();
}

// --- Admin destructive ops ---

export async function apiDeleteUser(userId: string): Promise<void> {
  const res = await apiFetch(`/admin/users/${userId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to delete user");
  }
}

export interface TempPassword {
  user_id: string;
  username: string;
  temporary_password: string;
}

export async function apiResetPassword(userId: string): Promise<TempPassword> {
  const res = await apiFetch(`/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to reset password");
  }
  return res.json();
}

export async function apiResetAllPasswords(): Promise<TempPassword[]> {
  const res = await apiFetch("/admin/users/reset-all-passwords", {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to reset passwords");
  }
  const data: { resets: TempPassword[] } = await res.json();
  return data.resets;
}

// --- Admin: token usage reset ---

export interface AdminUserUsage {
  used: number;
  limit: number;
  pct: number;
  is_unlimited: boolean;
  display_reset: string;
}

export async function apiGetUserUsage(
  username: string,
  signal?: AbortSignal
): Promise<AdminUserUsage> {
  const res = await apiFetch(`/admin/token-usage/users/${username}`, { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch user usage");
  }
  return res.json();
}

export async function apiResetUserUsage(username: string): Promise<void> {
  const res = await apiFetch(`/admin/token-usage/users/${username}/reset`, {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail || "Failed to reset user usage"
    );
  }
}

export async function apiResetAllUsage(): Promise<{ reset: number }> {
  const res = await apiFetch("/admin/token-usage/reset-all", {
    method: "POST",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { detail?: string }).detail || "Failed to reset all usage"
    );
  }
  return res.json();
}

// --- Profile update ---

export interface UpdateProfileData {
  username?: string;
  email?: string;
  current_password?: string;
  new_password?: string;
}

export interface UpdateProfileResult {
  user_id: string;
  username: string;
  role: Role;
  email?: string | null;
  access_token: string;
}

export async function apiUpdateProfile(
  data: UpdateProfileData
): Promise<UpdateProfileResult> {
  const res = await apiFetch("/user/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to update profile")
    );
  }
  return res.json();
}

// --- Admin: memory scopes ---

export type ScopeType = "project" | "vehicle" | "feature";
export type ScopeAccess = "read" | "write";

export const SCOPE_TYPES: ScopeType[] = ["project", "vehicle", "feature"];

export interface MemoryScope {
  scope_type: ScopeType;
  scope_id: string;
  display_name: string | null;
  aliases: string[];
  member_count?: number;
}

export interface ScopeMember {
  username: string;
  access: ScopeAccess;
}

export async function apiListScopes(): Promise<MemoryScope[]> {
  const res = await apiFetch("/admin/scopes");
  if (!res.ok) throw new Error("Failed to load scopes");
  return res.json();
}

export async function apiCreateScope(payload: {
  scope_type: ScopeType;
  scope_id: string;
  display_name?: string | null;
  aliases?: string[];
}): Promise<MemoryScope> {
  const res = await apiFetch("/admin/scopes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to create scope")
    );
  }
  return res.json();
}

export async function apiUpdateScope(
  scope_type: ScopeType,
  scope_id: string,
  payload: { display_name?: string | null; aliases?: string[] }
): Promise<MemoryScope> {
  const res = await apiFetch(`/admin/scopes/${scope_type}/${scope_id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to update scope")
    );
  }
  return res.json();
}

export async function apiDeleteScope(
  scope_type: ScopeType,
  scope_id: string
): Promise<void> {
  const res = await apiFetch(`/admin/scopes/${scope_type}/${scope_id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to delete scope")
    );
  }
}

export async function apiListScopeMembers(
  scope_type: ScopeType,
  scope_id: string,
  signal?: AbortSignal
): Promise<ScopeMember[]> {
  const res = await apiFetch(
    `/admin/scopes/${scope_type}/${scope_id}/members`,
    { signal }
  );
  if (!res.ok) throw new Error("Failed to load scope members");
  return res.json();
}

export async function apiAddScopeMember(
  scope_type: ScopeType,
  scope_id: string,
  payload: { username: string; access: ScopeAccess },
  signal?: AbortSignal
): Promise<ScopeMember> {
  const res = await apiFetch(
    `/admin/scopes/${scope_type}/${scope_id}/members`,
    { method: "POST", body: JSON.stringify(payload), signal }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to add member")
    );
  }
  return res.json();
}

export async function apiUpdateScopeMember(
  scope_type: ScopeType,
  scope_id: string,
  username: string,
  access: ScopeAccess
): Promise<ScopeMember> {
  const res = await apiFetch(
    `/admin/scopes/${scope_type}/${scope_id}/members/${username}`,
    { method: "PATCH", body: JSON.stringify({ access }) }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to update member")
    );
  }
  return res.json();
}

export async function apiRemoveScopeMember(
  scope_type: ScopeType,
  scope_id: string,
  username: string
): Promise<void> {
  const res = await apiFetch(
    `/admin/scopes/${scope_type}/${scope_id}/members/${username}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage((body as { detail?: unknown }).detail, "Failed to remove member")
    );
  }
}
