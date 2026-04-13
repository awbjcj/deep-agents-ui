export interface AuthUser {
  user_id: string;
  username: string;
  access_token: string;
}

const AUTH_KEY = "deep-agent-auth";

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
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
    throw new Error(data.detail || "Registration failed");
  }
  const data = await res.json();
  const user: AuthUser = {
    user_id: data.user_id,
    username: data.username,
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
    throw new Error(data.detail || "Login failed");
  }
  const data = await res.json();
  const user: AuthUser = {
    user_id: data.user_id,
    username: data.username,
    access_token: data.access_token,
  };
  saveAuthUser(user);
  return user;
}

export interface UserTokens {
  graph_api_token: string;
  jira_api_token: string;
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
