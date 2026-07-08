"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import {
  CheckCircle,
  ChevronRight,
  Clock,
  Download,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimestamp } from "@/app/utils/utils";
import { cn } from "@/lib/utils";
import {
  AdminConnectivityResponse,
  AdminConnectivityUpdatePayload,
  AdminUser,
  AdminUserUsage,
  apiAddScopeMember,
  apiCreateScope,
  apiDeleteScope,
  apiDeleteUser,
  apiGetAdminConnectivity,
  apiGetRunMode,
  apiGetTierImageFetching,
  apiGetTierModels,
  apiGetUserUsage,
  apiListScopeMembers,
  apiListScopes,
  apiListUsers,
  apiRemoveScopeMember,
  apiResetAllPasswords,
  apiResetAllUsage,
  apiResetPassword,
  apiResetUserUsage,
  apiSetAdminConnectivity,
  apiSetAllTierModels,
  apiSetRunMode,
  apiSetTierImageFetching,
  apiUpdateScope,
  apiUpdateScopeMember,
  apiUpdateUserRole,
  MemoryScope,
  Role,
  RunMode,
  RunModeInfo,
  SCOPE_TYPES,
  ScopeAccess,
  ScopeMember,
  ScopeType,
  TempPassword,
  TierModelEntry,
} from "@/lib/auth";

function defaultAccessForRole(role: Role): ScopeAccess {
  return role === "admin" || role === "developer" ? "write" : "read";
}
import { useAuth } from "@/providers/AuthProvider";

const ROLES: Role[] = ["user", "developer", "admin"];
const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

type TierMap = Record<Role, TierModelEntry[]>;
type TierTextMap = Record<Role, string>;

type AdminTab = "users" | "scopes" | "runmode" | "tiers";

interface AdminTabDef {
  id: AdminTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: AdminTabDef[] = [
  { id: "users", label: "Users", icon: Users },
  { id: "scopes", label: "Memories", icon: Layers },
  { id: "runmode", label: "Run mode", icon: Globe },
  { id: "tiers", label: "Models", icon: Sliders },
];

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [active, setActive] = useState<AdminTab>("users");

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 flex-col border-b border-border bg-card/70 backdrop-blur-sm">
        <div className="flex items-start justify-between px-4 pt-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--aptiv-glass-border)] bg-[var(--aptiv-glass-bg)] text-[var(--aptiv-orange)] shadow-sm">
              <Shield className="h-4 w-4" />
            </span>
            <div className="flex flex-col leading-none">
              <span className="aptiv-eyebrow">Admin Console</span>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
                {TABS.find((t) => t.id === active)?.label ?? "Administration"}
              </h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close admin panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          role="tablist"
          aria-label="Admin sections"
          className="mt-4 flex items-end gap-1.5 overflow-x-auto px-4"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                id={`admin-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`admin-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aptiv-orange)]/40",
                  isActive
                    ? "bg-background/60 text-foreground"
                    : "text-muted-foreground hover:bg-background/30 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -bottom-px left-0 right-0 h-[2.5px] rounded-t-full transition-opacity",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                  style={{ background: "var(--aptiv-orange)" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-6 p-5">
          {active === "users" && <UsersSection />}
          {active === "scopes" && <ScopesSection />}
          {active === "runmode" && <RunModeSection />}
          {active === "tiers" && <TiersSection />}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ───────────────────────── Users ───────────────────────── */

function UsersSection() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<Record<string, AdminUserUsage>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await apiListUsers();
      setUsers(list);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // Only refetch usage when the *set* of usernames changes — local mutations
  // (role change, delete, reset-usage) update users[] in place and must NOT
  // trigger a fan-out of N usage requests on every click.
  const usernameKey = useMemo(
    () =>
      users
        .map((u) => u.username)
        .sort()
        .join("\u0000"),
    [users]
  );

  useEffect(() => {
    if (usernameKey === "") return;
    const controller = new AbortController();
    const snapshot = usernameKey.split("\u0000").filter(Boolean);
    (async () => {
      const results = await Promise.allSettled(
        snapshot.map((name) => apiGetUserUsage(name, controller.signal))
      );
      if (controller.signal.aborted) return;
      const map: Record<string, AdminUserUsage> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          map[snapshot[i]!] = r.value;
        }
      });
      setUsage(map);
    })();
    return () => controller.abort();
  }, [usernameKey]);

  const handleRoleChange = async (id: string, role: Role) => {
    if (id === user?.user_id && role !== "admin") {
      toast.error("You cannot demote yourself");
      return;
    }
    try {
      const updated = await apiUpdateUserRole(id, role);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === id ? { ...u, role: updated.role } : u))
      );
      toast.success(`Updated ${updated.username} to ${updated.role}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleDelete = async (target: AdminUser) => {
    if (target.user_id === user?.user_id) return;
    if (!confirm(`Delete user ${target.username}? This cannot be undone.`)) {
      return;
    }
    try {
      await apiDeleteUser(target.user_id);
      setUsers((prev) => prev.filter((u) => u.user_id !== target.user_id));
      toast.success(`Deleted ${target.username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleResetPassword = async (target: AdminUser) => {
    let reset: TempPassword;
    try {
      reset = await apiResetPassword(target.user_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
      return;
    }
    // Password is rotated server-side. From here, never lose it: copy to
    // clipboard if possible, otherwise fall through to a TSV download so the
    // admin always walks away with the new credential.
    const tsv = [
      "username\ttemporary_password",
      `${reset.username}\t${reset.temporary_password}`,
    ].join("\n");
    const downloadTsv = () =>
      downloadBlob(
        tsv,
        "text/tab-separated-values",
        `${reset.username}-temp-password.tsv`
      );

    if (!navigator.clipboard?.writeText) {
      downloadTsv();
      toast.success("Temporary password downloaded");
      return;
    }
    try {
      await navigator.clipboard.writeText(reset.temporary_password);
      toast.success("Temporary password copied to clipboard");
    } catch {
      downloadTsv();
      toast.warning(
        "Clipboard unavailable — temporary password downloaded instead"
      );
    }
  };

  const handleResetUsage = async (target: AdminUser) => {
    if (!confirm(`Reset weekly token usage for ${target.username}?`)) return;
    try {
      await apiResetUserUsage(target.username);
      setUsage((prev) => {
        const next = { ...prev };
        if (next[target.username]) {
          next[target.username] = { ...next[target.username], used: 0, pct: 0 };
        }
        return next;
      });
      toast.success(`Reset usage for ${target.username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset usage");
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset passwords for all non-admin users?")) return;
    try {
      const resets = await apiResetAllPasswords();
      const tsv = ["username\ttemporary_password"]
        .concat(resets.map((r) => `${r.username}\t${r.temporary_password}`))
        .join("\n");
      downloadBlob(tsv, "text/tab-separated-values", "temp-passwords.tsv");
      toast.success(`Reset ${resets.length} password(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset passwords");
    }
  };

  const handleResetAllUsage = async () => {
    if (!confirm("Reset weekly token usage for ALL users?")) return;
    try {
      const { reset } = await apiResetAllUsage();
      setUsage((prev) => {
        const next: Record<string, AdminUserUsage> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = { ...v, used: 0, pct: 0 };
        }
        return next;
      });
      toast.success(`Reset usage for ${reset} user(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset all usage");
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="People"
        subtitle={`${users.length} ${users.length === 1 ? "account" : "accounts"} in this workspace`}
      />

      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const u_usage = usage[u.username];
            const isSelf = u.user_id === user?.user_id;
            return (
              <article
                key={u.user_id}
                className="aptiv-glass-soft rounded-lg p-3 shadow-sm transition-colors hover:bg-muted/50"
              >
                <header className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold uppercase text-primary">
                    {rolePrefix(u.role)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold tracking-tight">
                        {u.username}
                      </span>
                      {isSelf && (
                        <span className="rounded-sm bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <Select
                    value={u.role}
                    onValueChange={(v) => handleRoleChange(u.user_id, v as Role)}
                    disabled={isSelf}
                  >
                    <SelectTrigger
                      className="h-7 w-[110px] gap-1.5 px-2 text-xs"
                      aria-label={`Role for ${u.username}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role} className="text-xs">
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </header>

                {u_usage && (
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          u_usage.pct >= 90
                            ? "bg-destructive"
                            : u_usage.pct >= 70
                              ? "bg-[var(--color-warning)]"
                              : "bg-primary"
                        )}
                        style={{ width: `${Math.min(u_usage.pct, 100)}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap font-mono tabular-nums">
                      {u_usage.is_unlimited
                        ? `${Math.round(u_usage.used).toLocaleString()} · ∞`
                        : `${Math.round(u_usage.pct)}%`}
                    </span>
                    <span
                      className="whitespace-nowrap font-mono tabular-nums"
                      title={
                        u_usage.enforced === "calls"
                          ? "Call limit is enforced (proxy mode)"
                          : "Call usage (not enforced in this mode)"
                      }
                    >
                      {u_usage.enforced === "calls" ? "▶ " : ""}
                      {u_usage.calls_is_unlimited
                        ? `${u_usage.calls_used.toLocaleString()}·∞`
                        : `${u_usage.calls_used.toLocaleString()}/${u_usage.calls_limit.toLocaleString()} calls`}
                    </span>
                  </div>
                )}

                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  <ActionPill
                    icon={KeyRound}
                    label="Reset PW"
                    onClick={() => handleResetPassword(u)}
                  />
                  <ActionPill
                    icon={RotateCcw}
                    label="Reset Usage"
                    onClick={() => handleResetUsage(u)}
                    intent="renewal"
                  />
                  <ActionPill
                    icon={Trash2}
                    label="Delete"
                    onClick={() => handleDelete(u)}
                    intent="destructive"
                    disabled={isSelf}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="aptiv-glass-soft mt-4 space-y-2 rounded-lg p-3">
        <p className="aptiv-eyebrow">Bulk operations</p>
        <Button
          type="button"
          variant="outline"
          className="w-full text-[var(--aptiv-turquoise-dark)] hover:bg-[var(--aptiv-turquoise)]/10 hover:text-[var(--aptiv-turquoise-dark)] dark:text-[var(--aptiv-turquoise)] dark:hover:bg-[var(--aptiv-turquoise)]/15 dark:hover:text-[var(--aptiv-turquoise)]"
          onClick={handleResetAllUsage}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset all weekly usage
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleResetAll}
        >
          <Download className="mr-2 h-4 w-4" />
          Reset all non-admin passwords
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────── Memory Scopes ──────────────────────── */

function ScopesSection() {
  const [scopes, setScopes] = useState<MemoryScope[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const countRefreshRef = useRef<AbortController | null>(null);

  const fetchScopes = useCallback(async () => {
    setIsLoading(true);
    // Cancel any in-flight per-scope count fan-out from a prior fetch.
    countRefreshRef.current?.abort();
    const controller = new AbortController();
    countRefreshRef.current = controller;
    try {
      const list = await apiListScopes();
      setScopes(list);
      void refreshMemberCounts(list, setScopes, controller.signal);
    } catch {
      toast.error("Failed to load scopes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchScopes();
    return () => {
      countRefreshRef.current?.abort();
    };
  }, [fetchScopes]);

  const handleDelete = async (scope: MemoryScope) => {
    if (
      !confirm(
        `Delete scope ${scope.scope_type}/${scope.scope_id}? Members will lose access.`
      )
    )
      return;
    try {
      await apiDeleteScope(scope.scope_type, scope.scope_id);
      setScopes((prev) =>
        prev.filter(
          (s) =>
            !(s.scope_type === scope.scope_type && s.scope_id === scope.scope_id)
        )
      );
      if (expanded === scopeKey(scope)) setExpanded(null);
      toast.success("Scope deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete scope");
    }
  };

  const grouped = useMemo(() => {
    const out: Record<ScopeType, MemoryScope[]> = {
      project: [],
      vehicle: [],
      feature: [],
    };
    for (const s of scopes) {
      const bucket = out[s.scope_type];
      if (bucket) bucket.push(s);
    }
    return out;
  }, [scopes]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Memories"
        subtitle="Shared knowledge containers (project / vehicle / feature) with per-user read or write access"
      />

      <Button
        type="button"
        onClick={() => setCreating((v) => !v)}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        {creating ? "Cancel new scope" : "New scope"}
      </Button>

      {creating && (
        <CreateScopeCard
          onCancel={() => setCreating(false)}
          onCreated={(scope) => {
            setScopes((prev) => [...prev, scope]);
            setCreating(false);
            setExpanded(scopeKey(scope));
          }}
        />
      )}

      {isLoading ? (
        <LoadingRow />
      ) : scopes.length === 0 ? (
        <EmptyState
          title="No scopes yet"
          subtitle="Create a project, vehicle, or feature scope to start sharing memory across users."
        />
      ) : (
        <div className="space-y-5">
          {SCOPE_TYPES.map((type) => {
            const items = grouped[type];
            if (!items || items.length === 0) return null;
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: scopeTypeColor(type) }}
                  />
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {type}
                    <span className="ml-1.5 font-mono tabular-nums normal-case tracking-normal text-muted-foreground/60">
                      {items.length}
                    </span>
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {items.map((scope) => {
                    const key = scopeKey(scope);
                    const isOpen = expanded === key;
                    return (
                      <ScopeCard
                        key={key}
                        scope={scope}
                        isOpen={isOpen}
                        onToggle={() => setExpanded(isOpen ? null : key)}
                        onDelete={() => handleDelete(scope)}
                        onUpdated={(next) =>
                          setScopes((prev) =>
                            prev.map((s) =>
                              scopeKey(s) === key ? next : s
                            )
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateScopeCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (scope: MemoryScope) => void;
}) {
  const [scopeType, setScopeType] = useState<ScopeType>("project");
  const [scopeId, setScopeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [aliases, setAliases] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const canSubmit = scopeId.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const aliasList = aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const result = await apiCreateScope({
        scope_type: scopeType,
        scope_id: scopeId.trim(),
        display_name: displayName.trim() || null,
        aliases: aliasList,
      });
      if (!aliveRef.current) return;
      toast.success(`Created ${result.scope_type}/${result.scope_id}`);

      let finalScope = result;
      try {
        const allUsers = await apiListUsers(controller.signal);
        if (controller.signal.aborted) return;
        // Cap concurrency: a workspace with many users would otherwise blast
        // the backend with N parallel POSTs and saturate per-host connections.
        const granted = await runWithConcurrency(
          allUsers,
          6,
          (u) =>
            apiAddScopeMember(
              result.scope_type,
              result.scope_id,
              {
                username: u.username,
                access: defaultAccessForRole(u.role),
              },
              controller.signal
            ),
          controller.signal
        );
        if (controller.signal.aborted) return;
        finalScope = { ...result, member_count: granted };
        if (granted === allUsers.length) {
          toast.success(`Granted access to ${granted} user${granted === 1 ? "" : "s"}`);
        } else {
          toast.warning(
            `Granted access to ${granted}/${allUsers.length} users (some failed)`
          );
        }
      } catch {
        if (controller.signal.aborted) return;
        toast.warning("Created scope, but failed to auto-grant member access");
      }
      if (aliveRef.current) onCreated(finalScope);
    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error(err instanceof Error ? err.message : "Failed to create scope");
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  return (
    <div className="aptiv-glass-soft space-y-3 rounded-lg p-4 shadow-sm">
      <p className="aptiv-eyebrow">New scope</p>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </Label>
          <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            ID
          </Label>
          <Input
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            placeholder="e.g. VSDA, ACC, X7"
            className="h-9 font-mono"
            autoFocus
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Display name <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Vehicle Software Development Acceleration"
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Aliases <span className="font-normal normal-case text-muted-foreground/60">(comma-separated)</span>
        </Label>
        <Input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="vsda, deepagent"
          className="h-9"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit}
          className="flex-1"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Create
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ScopeCard({
  scope,
  isOpen,
  onToggle,
  onDelete,
  onUpdated,
}: {
  scope: MemoryScope;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: (next: MemoryScope) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(scope.display_name ?? "");
  const [aliases, setAliases] = useState((scope.aliases ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<ScopeMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberAccess, setNewMemberAccess] = useState<ScopeAccess>("read");
  const [adding, setAdding] = useState(false);

  // Monotonically increases each time the local membership is mutated locally
  // (add/remove) or a new load starts. A late-arriving load may only commit
  // its result if no newer mutation has happened in the meantime.
  const mutationGenRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const myGen = ++mutationGenRef.current;
    const controller = new AbortController();
    setMembersLoading(true);
    apiListScopeMembers(scope.scope_type, scope.scope_id, controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        // Skip stale-but-not-aborted results: a local add/remove fired while
        // we were in flight and already updated members; honour the user's
        // newer state rather than the server's snapshot from before the edit.
        if (mutationGenRef.current !== myGen) return;
        setMembers(list);
        if ((scope.member_count ?? 0) !== list.length) {
          onUpdated({ ...scope, member_count: list.length });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast.error("Failed to load members");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMembersLoading(false);
      });
    return () => controller.abort();
    // onUpdated intentionally omitted to avoid re-running on parent re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scope.scope_type, scope.scope_id]);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const aliasList = aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const result = await apiUpdateScope(scope.scope_type, scope.scope_id, {
        display_name: displayName.trim() || null,
        aliases: aliasList,
      });
      onUpdated(result);
      setEditing(false);
      toast.success("Scope updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scope");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    const username = newMemberName.trim();
    if (!username) return;
    setAdding(true);
    try {
      const result = await apiAddScopeMember(scope.scope_type, scope.scope_id, {
        username,
        access: newMemberAccess,
      });
      mutationGenRef.current += 1;
      const next = [
        ...members.filter((m) => m.username !== result.username),
        result,
      ];
      setMembers(next);
      onUpdated({ ...scope, member_count: next.length });
      setNewMemberName("");
      toast.success(`Added ${result.username} (${result.access})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const handleMemberAccessChange = async (
    username: string,
    access: ScopeAccess
  ) => {
    try {
      const result = await apiUpdateScopeMember(
        scope.scope_type,
        scope.scope_id,
        username,
        access
      );
      setMembers((prev) =>
        prev.map((m) =>
          m.username === username ? { ...m, access: result.access } : m
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update access");
    }
  };

  const handleRemoveMember = async (username: string) => {
    if (!confirm(`Remove ${username} from this scope?`)) return;
    try {
      await apiRemoveScopeMember(scope.scope_type, scope.scope_id, username);
      mutationGenRef.current += 1;
      const next = members.filter((m) => m.username !== username);
      setMembers(next);
      onUpdated({ ...scope, member_count: next.length });
      toast.success(`Removed ${username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  return (
    <article
      className={cn(
        "rounded-lg border bg-card/60 transition-colors",
        isOpen
          ? "border-[var(--aptiv-orange)]/40 shadow-sm"
          : "border-border hover:border-primary/30"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
        aria-expanded={isOpen}
      >
        <span
          className="h-7 w-1 flex-shrink-0 rounded-full"
          style={{ background: scopeTypeColor(scope.scope_type) }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-sm font-semibold tracking-tight text-foreground">
              {scope.scope_id}
            </span>
            {scope.display_name && (
              <span className="truncate text-xs text-muted-foreground">
                {scope.display_name}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">
              {scope.member_count ?? 0} member{(scope.member_count ?? 0) === 1 ? "" : "s"}
            </span>
            {(scope.aliases?.length ?? 0) > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  alias {(scope.aliases ?? []).join(", ")}
                </span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-border/60 px-3 py-3">
          {!editing ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setEditing(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Display name
                </Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Aliases
                </Label>
                <Input
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  className="h-9"
                  placeholder="comma-separated"
                />
              </div>
              <div className="flex gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setEditing(false);
                    setDisplayName(scope.display_name ?? "");
                    setAliases((scope.aliases ?? []).join(", "));
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={saving}
                  onClick={handleSaveEdit}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Save
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="aptiv-eyebrow">Members</p>
            {membersLoading ? (
              <LoadingRow compact />
            ) : members.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-center text-[11px] text-muted-foreground">
                No members yet. Add one below.
              </p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.username}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                      {m.username.slice(0, 2)}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium">
                      {m.username}
                    </span>
                    <Select
                      value={m.access}
                      onValueChange={(v) =>
                        handleMemberAccessChange(m.username, v as ScopeAccess)
                      }
                    >
                      <SelectTrigger className="h-7 w-[78px] gap-1 px-2 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read" className="text-xs">
                          read
                        </SelectItem>
                        <SelectItem value="write" className="text-xs">
                          write
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.username)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove ${m.username}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-1.5 pt-1">
              <Input
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="username"
                className="h-8 flex-1 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddMember();
                  }
                }}
              />
              <Select
                value={newMemberAccess}
                onValueChange={(v) => setNewMemberAccess(v as ScopeAccess)}
              >
                <SelectTrigger className="h-8 w-[78px] gap-1 px-2 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read" className="text-xs">
                    read
                  </SelectItem>
                  <SelectItem value="write" className="text-xs">
                    write
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                disabled={adding || !newMemberName.trim()}
                onClick={handleAddMember}
                aria-label="Add member"
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/* ───────────────────── Run Mode ──────────────────────── */

function RunModeSection() {
  const [pending, setPending] = useState<RunMode>("gateway");
  const [info, setInfo] = useState<RunModeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiGetRunMode()
      .then((data) => {
        setPending(data.run_mode);
        setInfo(data);
      })
      .catch(() => toast.error("Failed to load run mode"))
      .finally(() => setIsLoading(false));
  }, []);

  // Clear the "Saved" timer on unmount so we never setState after teardown.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

  const dirty = info !== null && pending !== info.run_mode;

  const handleSave = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const updated = await apiSetRunMode(pending);
      setPending(updated.run_mode);
      setInfo(updated);
      setSaved(true);
      toast.success("Run mode saved");
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save run mode");
    } finally {
      setIsSaving(false);
    }
  };

  // WAI-ARIA radio group keyboard contract: arrow keys move + select, Home/End
  // jump to ends. Roving tabindex below means only the active option is in the
  // tab order, so Tab enters/exits the group as a single stop.
  const handleRadioKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const last = RUN_MODES.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? last : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = RUN_MODES[nextIndex]!;
    setPending(target);
    radioRefs.current[nextIndex]?.focus();
  };

  // --- URL Overrides ---
  const [connectivity, setConnectivity] = useState<AdminConnectivityResponse | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [isSavingUrls, setIsSavingUrls] = useState(false);

  useEffect(() => {
    apiGetAdminConnectivity()
      .then((data) => {
        setConnectivity(data);
        const draft: Record<string, string> = {};
        for (const [key, info] of Object.entries(data.urls)) {
          draft[key] = info.value;
        }
        setUrlDraft(draft);
      })
      .catch(() => toast.error("Failed to load URL settings"));
  }, []);

  const urlsDirty = connectivity
    ? Object.entries(urlDraft).some(
        ([key, val]) => val !== (connectivity.urls[key]?.value ?? "")
      )
    : false;

  const handleSaveUrls = async () => {
    if (!urlsDirty) return;
    setIsSavingUrls(true);
    try {
      const payload: AdminConnectivityUpdatePayload = {};
      for (const [key, val] of Object.entries(urlDraft)) {
        if (val !== (connectivity?.urls[key]?.value ?? "")) {
          (payload as Record<string, string>)[key] = val;
        }
      }
      const updated = await apiSetAdminConnectivity(payload);
      setConnectivity(updated);
      const freshDraft: Record<string, string> = {};
      for (const [key, info] of Object.entries(updated.urls)) {
        freshDraft[key] = info.value;
      }
      setUrlDraft(freshDraft);
      toast.success("URL overrides saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save URLs");
    } finally {
      setIsSavingUrls(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Connectivity"
        subtitle="How agent requests reach the LLM backend"
      />

      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="aptiv-glass-soft space-y-3 rounded-lg p-4 shadow-sm">
          <div
            role="radiogroup"
            aria-label="Modes"
            className="grid grid-cols-3 gap-1.5"
          >
            {RUN_MODES.map((mode, index) => {
              const active = pending === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  ref={(el) => {
                    radioRefs.current[index] = el;
                  }}
                  onKeyDown={(event) => handleRadioKeyDown(event, index)}
                  onClick={() => setPending(mode)}
                  className={cn(
                    "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--text-button-primary)] shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
                      : "border-border bg-card hover:-translate-y-px hover:border-[var(--color-primary)]/40 hover:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--aptiv-orange)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--aptiv-orange)_25%,transparent)]"
                    />
                  )}
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-tight transition-colors",
                      active
                        ? "text-[var(--text-button-primary)]"
                        : "text-foreground group-hover:text-[var(--color-primary)]"
                    )}
                  >
                    {mode}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors",
                      active
                        ? "text-[var(--text-button-primary)]/75"
                        : "text-muted-foreground"
                    )}
                  >
                    {runModeBlurb(mode)}
                  </span>
                </button>
              );
            })}
          </div>

          {info && info.run_mode_updated_at !== "Unknown" && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="font-semibold uppercase tracking-wider">
                Updated
              </span>
              <time className="font-mono tabular-nums" dateTime={info.run_mode_updated_at}>
                {formatTimestamp(info.run_mode_updated_at)}
              </time>
              <span className="text-muted-foreground/70">
                ({info.run_mode_time_gap})
              </span>
            </div>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : saved ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save run mode
              </>
            )}
          </Button>
        </div>
      )}

      {connectivity && (
        <div className="space-y-3 border-t border-border/40 pt-5">
          <SectionHeader
            title="URL Overrides"
            subtitle="Override environment URLs for each provider and mode. Empty = use .env default."
          />

          {(["openai", "anthropic"] as const).map((provider) => (
            <div key={provider} className="space-y-2">
              <p className="aptiv-eyebrow">{provider === "openai" ? "OpenAI" : "Anthropic"}</p>
              {(["remote", "gateway", "proxy"] as const).map((mode) => {
                const key = provider === "openai"
                  ? `openai_base_url${mode === "remote" ? "" : `_${mode}`}`
                  : `claude_base_url${mode === "remote" ? "" : `_${mode}`}`;
                const info = connectivity.urls[key];
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {mode} URL
                    </Label>
                    <Input
                      value={urlDraft[key] ?? ""}
                      onChange={(e) =>
                        setUrlDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder="(not set — using .env)"
                      className={cn(
                        "h-9 font-mono text-[11px]",
                        info?.source === "database" && info.value
                          ? "border-primary/40"
                          : ""
                      )}
                    />
                    <span className={cn(
                      "text-[9px]",
                      info?.source === "database" && info.value
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}>
                      Source: {info?.source ?? "env"}
                      {info?.source === "database" && info.updated_at && (
                        <> · Updated {formatTimestamp(info.updated_at)}</>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          <Button
            type="button"
            onClick={handleSaveUrls}
            disabled={isSavingUrls || !urlsDirty}
            className="w-full"
          >
            {isSavingUrls ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save URL overrides
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Tier Allowlists ──────────────────────── */

function TiersSection() {
  const [tiers, setTiers] = useState<TierMap>({
    user: [],
    developer: [],
    admin: [],
  });
  const [tierText, setTierText] = useState<TierTextMap>({
    user: "",
    developer: "",
    admin: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiGetTierModels("user"),
      apiGetTierModels("developer"),
      apiGetTierModels("admin"),
    ])
      .then(([u, d, a]) => {
        const next: TierMap = {
          user: u.models,
          developer: d.models,
          admin: a.models,
        };
        setTiers(next);
        setTierText(tierMapToText(next));
      })
      .catch(() => toast.error("Failed to load tier allowlists"))
      .finally(() => setIsLoading(false));
  }, []);

  const savedText = useMemo(() => tierMapToText(tiers), [tiers]);
  const dirty =
    tierText.user !== savedText.user ||
    tierText.developer !== savedText.developer ||
    tierText.admin !== savedText.admin;

  const handleSave = async () => {
    const parsed = {} as TierMap;
    for (const tier of ROLES) {
      try {
        parsed[tier] = parseTierText(tierText[tier]);
      } catch (err) {
        toast.error(
          `${tier}: ${err instanceof Error ? err.message : "Invalid entry"}`
        );
        return;
      }
    }
    setIsSaving(true);
    try {
      const updated = await apiSetAllTierModels(parsed);
      setTiers(updated);
      setTierText(tierMapToText(updated));
      toast.success("Tier allowlists saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tiers");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Tier model allowlists"
        subtitle="Which provider/model pairs each role can pick from"
      />
      {isLoading ? (
        <LoadingRow />
      ) : (
        <>
          {ROLES.map((tier) => (
            <div key={tier} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label
                  htmlFor={`tier-${tier}`}
                  className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {tier}
                </Label>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                  {tiers[tier].length} model{tiers[tier].length === 1 ? "" : "s"}
                </span>
              </div>
              <Textarea
                id={`tier-${tier}`}
                value={tierText[tier]}
                onChange={(e) =>
                  setTierText((prev) => ({
                    ...prev,
                    [tier]: e.target.value,
                  }))
                }
                rows={Math.max(2, tierText[tier].split("\n").length + 1)}
                placeholder="provider:model (one per line)"
                className="min-h-[72px] font-mono text-xs"
              />
            </div>
          ))}
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save tier allowlists
              </>
            )}
          </Button>
        </>
      )}

      <ImageFetchingTierToggles />
    </div>
  );
}

function ImageFetchingTierToggles() {
  const [tierStates, setTierStates] = useState<Record<Role, boolean>>({
    user: false,
    developer: false,
    admin: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiGetTierImageFetching("user"),
      apiGetTierImageFetching("developer"),
      apiGetTierImageFetching("admin"),
    ])
      .then(([u, d, a]) => {
        setTierStates({ user: u.enabled, developer: d.enabled, admin: a.enabled });
      })
      .catch(() => toast.error("Failed to load image fetching settings"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggle = async (tier: Role, checked: boolean) => {
    const prev = tierStates[tier];
    setTierStates((s) => ({ ...s, [tier]: checked }));
    try {
      await apiSetTierImageFetching(tier, checked);
      toast.success(`Image fetching ${checked ? "enabled" : "disabled"} for ${tier}`);
    } catch {
      setTierStates((s) => ({ ...s, [tier]: prev }));
      toast.error("Failed to update image fetching");
    }
  };

  return (
    <div className="space-y-3 border-t border-border/40 pt-5">
      <SectionHeader
        title="Image fetching"
        subtitle="Allow users in each tier to attach images from tickets and pages"
      />
      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-2">
          {ROLES.map((tier) => (
            <div
              key={tier}
              className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tier}
              </span>
              <Switch
                checked={tierStates[tier]}
                onCheckedChange={(checked) => handleToggle(tier, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Shared atoms ──────────────────────── */

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {subtitle && (
        <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      )}
      <span className="aptiv-rule" aria-hidden="true" />
    </header>
  );
}

function LoadingRow({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        compact ? "py-2" : "py-6"
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

type ActionIntent = "neutral" | "primary" | "renewal" | "destructive";

function ActionPill({
  icon: Icon,
  label,
  onClick,
  intent = "neutral",
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  intent?: ActionIntent;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-40",
        intent === "neutral" &&
          "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40",
        intent === "primary" &&
          "border-[var(--aptiv-sky)]/60 bg-[var(--aptiv-sky)]/25 text-[var(--aptiv-sky-strong)] hover:border-[var(--aptiv-sky)] hover:bg-[var(--aptiv-sky)]/35 dark:bg-[var(--aptiv-sky)]/20 dark:text-[var(--aptiv-sky)] dark:hover:bg-[var(--aptiv-sky)]/30",
        intent === "renewal" &&
          "border-[var(--aptiv-turquoise)]/45 bg-[var(--aptiv-turquoise)]/10 text-[var(--aptiv-turquoise-dark)] hover:border-[var(--aptiv-turquoise)] hover:bg-[var(--aptiv-turquoise)]/18 hover:text-[var(--aptiv-turquoise-dark)] dark:border-[var(--aptiv-turquoise)]/50 dark:bg-[var(--aptiv-turquoise)]/14 dark:text-[var(--aptiv-turquoise)] dark:hover:bg-[var(--aptiv-turquoise)]/22",
        intent === "destructive" &&
          "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

/* ───────────────────── Helpers ──────────────────────── */

function entriesToText(entries: TierModelEntry[]): string {
  return entries.map((e) => `${e.provider}:${e.model}`).join("\n");
}

function tierMapToText(map: TierMap): TierTextMap {
  return Object.fromEntries(
    ROLES.map((r) => [r, entriesToText(map[r])])
  ) as TierTextMap;
}

function parseTierText(text: string): TierModelEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        throw new Error(`Invalid model entry: ${line}`);
      }
      const provider = line.slice(0, separatorIndex).trim();
      const model = line.slice(separatorIndex + 1).trim();
      if (!provider || !model) {
        throw new Error(`Invalid model entry: ${line}`);
      }
      return { provider, model };
    });
}

function scopeKey(s: MemoryScope): string {
  return `${s.scope_type}/${s.scope_id}`;
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 * Returns the number of fulfilled results. Bails out early if `signal` aborts.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
  signal?: AbortSignal
): Promise<number> {
  if (items.length === 0) return 0;
  const cap = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  let fulfilled = 0;
  const worker = async () => {
    while (!signal?.aborted) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await fn(items[i]!);
        fulfilled += 1;
      } catch {
        // Swallowed; caller decides what partial-success means.
      }
    }
  };
  await Promise.all(Array.from({ length: cap }, worker));
  return fulfilled;
}

async function refreshMemberCounts(
  list: MemoryScope[],
  setScopes: Dispatch<SetStateAction<MemoryScope[]>>,
  signal?: AbortSignal
): Promise<void> {
  if (list.length === 0) return;
  const results = await Promise.allSettled(
    list.map((s) =>
      apiListScopeMembers(s.scope_type, s.scope_id, signal).then((members) => ({
        key: scopeKey(s),
        count: members.length,
      }))
    )
  );
  if (signal?.aborted) return;
  const counts = new Map<string, number>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      counts.set(r.value.key, r.value.count);
    }
  }
  if (counts.size === 0) return;
  setScopes((prev) =>
    prev.map((s) => {
      const next = counts.get(scopeKey(s));
      return next === undefined ? s : { ...s, member_count: next };
    })
  );
}

function scopeTypeColor(type: ScopeType): string {
  switch (type) {
    case "project":
      return "var(--aptiv-orange)";
    case "vehicle":
      return "var(--aptiv-turquoise)";
    case "feature":
      return "var(--aptiv-slate)";
  }
}

function runModeBlurb(mode: RunMode): string {
  switch (mode) {
    case "remote":
      return "Direct provider";
    case "gateway":
      return "Via gateway";
    case "proxy":
      return "Via proxy";
  }
}

function rolePrefix(role: Role): string {
  switch (role) {
    case "admin":
      return "AD";
    case "developer":
      return "DE";
    case "user":
      return "US";
  }
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
