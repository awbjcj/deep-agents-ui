export interface AuthUser {
  user_id: string;
  username: string;
  role: string;
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
  graph_api_token: string;
  jira_api_token: string;
  graph_api_token_preview: string;
  jira_api_token_preview: string;
  graph_api_token_updated_at: string;
  jira_api_token_updated_at: string;
  graph_api_token_time_gap: string;
  jira_api_token_time_gap: string;
}

export async function apiGetTokens(): Promise<UserTokens> {
  const res = await apiFetch("/user/tokens");
  if (!res.ok) {
    throw new Error("Failed to fetch tokens");
  }
  return res.json();
}

export async function apiUpdateTokens(
  tokens: Partial<UserTokens>
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
  role: string;
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

// --- Run mode ---

export interface RunModeInfo {
  run_mode: string;
  last_updated_at: string;
}

export async function apiGetRunMode(): Promise<RunModeInfo> {
  const res = await apiFetch("/run-mode");
  if (!res.ok) {
    throw new Error("Failed to fetch run mode");
  }
  return res.json();
}

export async function apiUpdateRunMode(
  run_mode: "dev" | "pre" | "prod"
): Promise<RunModeInfo> {
  const res = await apiFetch("/run-mode", {
    method: "PUT",
    body: JSON.stringify({ run_mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { detail?: string }).detail || "Failed to update run mode");
  }
  return res.json();
}

// --- Admin: user management ---

export interface AdminUser {
  user_id: string;
  username: string;
  role: string;
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
  role: "user" | "admin"
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
