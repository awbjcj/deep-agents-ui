import { load } from "js-yaml";

import type {
  Role,
  ScopeAccess,
  ScopeDefaultAccess,
  ScopeType,
} from "@/lib/auth";

export interface ScopeManifestMember {
  username: string;
  access: ScopeAccess;
}

export interface ScopeManifestEntry {
  scope_type: ScopeType;
  scope_id: string;
  display_name: string | null;
  aliases: string[];
  default_access: ScopeDefaultAccess;
  members: ScopeManifestMember[];
}

const SCOPE_TYPES = new Set<ScopeType>(["project", "vehicle", "feature"]);
const DEFAULT_ACCESS = new Set<ScopeDefaultAccess>(["none", "read", "tier"]);
const MEMBER_ACCESS = new Set<ScopeAccess>(["read", "write"]);
const SCOPE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_SCOPES_PER_FILE = 250;

/** Merge additive manifest grants without removing members omitted from the file. */
export function mergeScopeMembers(
  current: ScopeManifestMember[],
  grants: ScopeManifestMember[]
): ScopeManifestMember[] {
  const merged = new Map(current.map((member) => [member.username, member]));
  for (const grant of grants) merged.set(grant.username, grant);
  return [...merged.values()];
}

/** Build the all-user role preset while preserving any wider custom write grant. */
export function roleAccessMembers(
  current: ScopeManifestMember[],
  users: Array<{ username: string; role: Role }>
): ScopeManifestMember[] {
  const merged = new Map(current.map((member) => [member.username, member]));
  for (const user of users) {
    const desired: ScopeAccess =
      user.role === "developer" || user.role === "admin" ? "write" : "read";
    const existing = merged.get(user.username)?.access;
    merged.set(user.username, {
      username: user.username,
      access: existing === "write" ? "write" : desired,
    });
  }
  return [...merged.values()];
}

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value.trim() || null;
}

function aliasesAt(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (
    !Array.isArray(value) ||
    !value.every((alias) => typeof alias === "string")
  ) {
    throw new Error(`${path} must be a list of strings`);
  }
  return [...new Set(value.map((alias) => alias.trim()).filter(Boolean))];
}

function membersAt(value: unknown, path: string): ScopeManifestMember[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);

  const usernames = new Set<string>();
  return value.map((rawMember, index) => {
    const memberPath = `${path}[${index}]`;
    const member = recordAt(rawMember, memberPath);
    const usernameValue = member.username ?? member.user;
    if (typeof usernameValue !== "string" || !usernameValue.trim()) {
      throw new Error(`${memberPath}.user must be a non-empty string`);
    }
    const username = usernameValue.trim();
    if (usernames.has(username)) {
      throw new Error(`${path} contains duplicate user ${username}`);
    }
    usernames.add(username);

    const access = member.access ?? "read";
    if (
      typeof access !== "string" ||
      !MEMBER_ACCESS.has(access as ScopeAccess)
    ) {
      throw new Error(`${memberPath}.access must be read or write`);
    }
    return { username, access: access as ScopeAccess };
  });
}

/** Parse and normalize the same additive YAML/JSON manifest used by manage_scopes.py. */
export function parseScopeManifest(source: string): ScopeManifestEntry[] {
  let parsed: unknown;
  try {
    parsed = load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid YAML";
    throw new Error(`Could not parse config file: ${message}`, {
      cause: error,
    });
  }

  const document = recordAt(parsed, "Config file");
  if (!Array.isArray(document.scopes) || document.scopes.length === 0) {
    throw new Error("Config file must contain a non-empty scopes list");
  }
  if (document.scopes.length > MAX_SCOPES_PER_FILE) {
    throw new Error(
      `Config file may contain at most ${MAX_SCOPES_PER_FILE} scopes`
    );
  }

  const scopeKeys = new Set<string>();
  return document.scopes.map((rawScope, index) => {
    const path = `scopes[${index}]`;
    const scope = recordAt(rawScope, path);
    const typeValue = scope.scope_type ?? scope.type;
    if (
      typeof typeValue !== "string" ||
      !SCOPE_TYPES.has(typeValue as ScopeType)
    ) {
      throw new Error(`${path}.type must be project, vehicle, or feature`);
    }
    const idValue = scope.scope_id ?? scope.id;
    if (typeof idValue !== "string" || !SCOPE_ID_PATTERN.test(idValue.trim())) {
      throw new Error(`${path}.id must match ${SCOPE_ID_PATTERN.source}`);
    }

    const key = `${typeValue}/${idValue.trim()}`;
    if (scopeKeys.has(key))
      throw new Error(`Config file contains duplicate scope ${key}`);
    scopeKeys.add(key);

    const defaultAccessValue = scope.default_access ?? "tier";
    if (
      typeof defaultAccessValue !== "string" ||
      !DEFAULT_ACCESS.has(defaultAccessValue as ScopeDefaultAccess)
    ) {
      throw new Error(`${path}.default_access must be none, read, or tier`);
    }

    return {
      scope_type: typeValue as ScopeType,
      scope_id: idValue.trim(),
      display_name: optionalString(scope.display_name, `${path}.display_name`),
      aliases: aliasesAt(scope.aliases, `${path}.aliases`),
      default_access: defaultAccessValue as ScopeDefaultAccess,
      members: membersAt(scope.members, `${path}.members`),
    };
  });
}
