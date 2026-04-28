export type Role = "user" | "developer" | "admin";

export interface AuthUser {
  user_id: string;
  username: string;
  role: Role;
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
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

function extractErrorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI Pydantic validation error format: [{loc, msg, type}]
    return detail.map((e: { msg?: string }) => e.msg || String(e)).join("; ");
  }
  return fallback;
}

export async function apiRegister(
  username: string,
  password: string
): Promise<AuthUser> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data.detail, "Registration failed"));
  }
  const data = await res.json();
  const user: AuthUser = {
    user_id: data.user_id,
    username: data.username,
    role: data.role,
    access_token: data.access_token,
  };
  saveAuthUser(user);
  return user;
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
    access_token: data.access_token,
  };
  saveAuthUser(user);
  return user;
}

export interface UserTokens {
  graph_api_token_preview: string;
  jira_api_token_preview: string;
  polarion_api_token_preview: string;
  graph_api_token_updated_at: string;
  jira_api_token_updated_at: string;
  polarion_api_token_updated_at: string;
  graph_api_token_time_gap: string;
  jira_api_token_time_gap: string;
  polarion_api_token_time_gap: string;
}

export async function apiGetTokens(): Promise<UserTokens> {
  const res = await apiFetch("/user/tokens");
  if (!res.ok) {
    throw new Error("Failed to fetch tokens");
  }
  return res.json();
}

export async function apiUpdateTokens(
  tokens: { graph_api_token?: string; jira_api_token?: string; polarion_api_token?: string }
): Promise<UserTokens> {
  const res = await apiFetch("/user/tokens", {
    method: "PUT",
    body: JSON.stringify(tokens),
  });
  if (!res.ok) {
    throw new Error("Failed to update tokens");
  }
  return res.json();
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

export async function apiListUsers(): Promise<AdminUser[]> {
  const res = await apiFetch("/admin/users");
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

// --- Tier model allowlist ---

export interface TierModelEntry {
  provider: string;
  model: string;
}

export interface TierAllowlist {
  tier: Role;
  models: TierModelEntry[];
}

export async function apiGetTierModels(tier: Role): Promise<TierAllowlist> {
  const res = await apiFetch(`/admin/tier-models/${tier}`);
  if (!res.ok) {
    throw new Error("Failed to fetch tier models");
  }
  return res.json();
}

export async function apiGetAllowedModels(): Promise<{ models: TierModelEntry[] }> {
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

// --- Per-user model selection ---

export interface UserModelSelection {
  provider: string | null;
  model: string | null;
}

export async function apiGetUserModel(): Promise<UserModelSelection> {
  const res = await apiFetch("/user/model");
  if (!res.ok) {
    throw new Error("Failed to fetch user model");
  }
  return res.json();
}

export async function apiSetUserModel(
  provider: string,
  model: string
): Promise<UserModelSelection> {
  const res = await apiFetch("/user/model", {
    method: "PUT",
    body: JSON.stringify({ provider, model }),
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

// --- Profile update ---

export interface UpdateProfileData {
  username?: string;
  current_password?: string;
  new_password?: string;
}

export interface UpdateProfileResult {
  user_id: string;
  username: string;
  role: Role;
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
