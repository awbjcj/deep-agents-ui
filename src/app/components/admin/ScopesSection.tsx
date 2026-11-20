"use client";

import { SETTINGS_WIDE_GRID } from "@/app/components/settings/SettingsLayout";
import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ScopeImportCard,
  type ScopeImportResult,
} from "@/app/components/admin/ScopeImportCard";
import { RoleBadge } from "@/app/utils/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiAddScopeMember,
  apiCreateScope,
  apiDeleteScope,
  apiListScopeMembers,
  apiListScopes,
  apiListUsers,
  apiRemoveScopeMember,
  apiSetScopeMembers,
  apiUpdateScope,
  apiUpdateScopeMember,
  MemoryScope,
  Role,
  SCOPE_TYPES,
  ScopeAccess,
  ScopeDefaultAccess,
  ScopeMember,
  ScopeType,
} from "@/lib/auth";
import {
  mergeScopeMembers,
  roleAccessMembers,
  type ScopeManifestEntry,
} from "@/lib/scope-manifest";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  LoadingRow,
  SectionHeader,
} from "@/app/components/admin/primitives";

export function ScopesSection() {
  const [scopes, setScopes] = useState<MemoryScope[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [applyingRoleAccess, setApplyingRoleAccess] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, Role>>({});
  const countRefreshRef = useRef<AbortController | null>(null);

  const fetchScopes = useCallback(async () => {
    setIsLoading(true);
    // Cancel any in-flight per-scope count fan-out from a prior fetch.
    countRefreshRef.current?.abort();
    const controller = new AbortController();
    countRefreshRef.current = controller;
    try {
      const list = await apiListScopes();
      // A newer fetch (or unmount) superseded this one; keep its result.
      if (controller.signal.aborted) return;
      setScopes(list);
      void refreshMemberCounts(list, setScopes, controller.signal);
    } catch {
      if (!controller.signal.aborted) toast.error("Failed to load scopes");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchScopes();
    return () => {
      countRefreshRef.current?.abort();
    };
  }, [fetchScopes]);

  useEffect(() => {
    const controller = new AbortController();
    apiListUsers(controller.signal)
      .then((list) => {
        const map: Record<string, Role> = {};
        for (const u of list) map[u.username] = u.role;
        setUserRoles(map);
      })
      .catch(() => {
        // Role labels are a display nicety; silently ignore load failures.
      });
    return () => controller.abort();
  }, []);

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
            !(
              s.scope_type === scope.scope_type && s.scope_id === scope.scope_id
            )
        )
      );
      if (expanded === scopeKey(scope)) setExpanded(null);
      toast.success("Scope deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete scope"
      );
    }
  };

  const handleManifestApply = async (
    entries: ScopeManifestEntry[]
  ): Promise<ScopeImportResult> => {
    const currentByKey = new Map(
      scopes.map((scope) => [scopeKey(scope), scope])
    );
    let applied = 0;
    let failed = 0;

    await runWithConcurrency(entries, 4, async (entry) => {
      try {
        const key = scopeKey(entry);
        const existing = currentByKey.get(key);
        const payload = {
          display_name: entry.display_name,
          aliases: entry.aliases,
          default_access: entry.default_access,
        };
        const saved = existing
          ? await apiUpdateScope(entry.scope_type, entry.scope_id, payload)
          : await apiCreateScope({
              scope_type: entry.scope_type,
              scope_id: entry.scope_id,
              ...payload,
            });

        if (entry.members.length > 0) {
          const currentMembers = await apiListScopeMembers(
            entry.scope_type,
            entry.scope_id
          );
          const merged = mergeScopeMembers(currentMembers, entry.members);
          await apiSetScopeMembers(entry.scope_type, entry.scope_id, merged);
          saved.member_count = merged.length;
        }
        applied += 1;
      } catch {
        failed += 1;
      }
    });

    await fetchScopes();
    if (failed === 0) {
      toast.success(
        `Applied ${applied} knowledge scope${applied === 1 ? "" : "s"}`
      );
    } else {
      toast.warning(
        `Applied ${applied}/${entries.length} scopes; ${failed} failed`
      );
    }
    return { applied, failed };
  };

  const handleApplyRoleAccess = async () => {
    if (scopes.length === 0 || applyingRoleAccess) return;
    if (
      !confirm(
        `Apply role-based access to all ${scopes.length} scopes? ` +
          "All users will receive read access and developers/admins will receive write access."
      )
    )
      return;

    setApplyingRoleAccess(true);
    let applied = 0;
    let failed = 0;
    try {
      const users = await apiListUsers();
      await runWithConcurrency(scopes, 4, async (scope) => {
        try {
          const currentMembers = await apiListScopeMembers(
            scope.scope_type,
            scope.scope_id
          );
          const merged = roleAccessMembers(currentMembers, users);
          await apiUpdateScope(scope.scope_type, scope.scope_id, {
            default_access: "tier",
          });
          await apiSetScopeMembers(scope.scope_type, scope.scope_id, merged);
          applied += 1;
        } catch {
          failed += 1;
        }
      });
      await fetchScopes();
      if (failed === 0) {
        toast.success(`Applied role access to all ${applied} scopes`);
      } else {
        toast.warning(
          `Applied role access to ${applied}/${scopes.length} scopes`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load users"
      );
    } finally {
      setApplyingRoleAccess(false);
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
      <SectionHeader title="Shared scopes" />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          {creating ? "Cancel new scope" : "New scope"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void handleApplyRoleAccess()}
          disabled={isLoading || scopes.length === 0 || applyingRoleAccess}
        >
          {applyingRoleAccess ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Users className="mr-2 h-4 w-4" />
          )}
          {applyingRoleAccess
            ? "Applying access"
            : "Apply access to all scopes"}
        </Button>
      </div>

      <div className="settings-surface space-y-2 p-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Role access grants read to users and write to developers/admins.
          Existing custom write grants are preserved, and future users inherit
          access by role.
        </p>
        <ScopeImportCard onApply={handleManifestApply} />
      </div>

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
        <EmptyState title="No scopes yet" />
      ) : (
        <div className="space-y-5">
          {SCOPE_TYPES.map((type) => {
            const items = grouped[type];
            if (!items || items.length === 0) return null;
            return (
              <div
                key={type}
                className="space-y-2"
              >
                <div className="flex items-center gap-2 px-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: scopeTypeColor(type) }}
                  />
                  <h4 className="text-muted-foreground text-xs font-bold tracking-[0.18em] uppercase">
                    {type}
                    <span className="text-muted-foreground/60 ml-1.5 font-mono tracking-normal normal-case tabular-nums">
                      {items.length}
                    </span>
                  </h4>
                </div>
                <div className={SETTINGS_WIDE_GRID}>
                  {items.map((scope) => {
                    const key = scopeKey(scope);
                    const isOpen = expanded === key;
                    return (
                      <ScopeCard
                        key={key}
                        scope={scope}
                        isOpen={isOpen}
                        userRoles={userRoles}
                        onToggle={() => setExpanded(isOpen ? null : key)}
                        onDelete={() => handleDelete(scope)}
                        onUpdated={(next) =>
                          setScopes((prev) =>
                            prev.map((s) => (scopeKey(s) === key ? next : s))
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
  const formId = useId();
  const [scopeType, setScopeType] = useState<ScopeType>("project");
  const [scopeId, setScopeId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [aliases, setAliases] = useState("");
  const [defaultAccess, setDefaultAccess] =
    useState<ScopeDefaultAccess>("tier");
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
  const dirty =
    !!scopeId ||
    !!displayName ||
    !!aliases ||
    scopeType !== "project" ||
    defaultAccess !== "tier";
  useSettingsDraft(dirty || submitting);

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
        default_access: defaultAccess,
      });
      if (!aliveRef.current) return;
      toast.success(`Created ${result.scope_type}/${result.scope_id}`);
      if (aliveRef.current) onCreated({ ...result, member_count: 1 });
    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error(
        err instanceof Error ? err.message : "Failed to create scope"
      );
    } finally {
      if (aliveRef.current) setSubmitting(false);
    }
  };

  return (
    <div className="settings-surface space-y-3 p-4">
      <h4 className="text-sm font-semibold">New scope</h4>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formId}-type`}
            className="text-muted-foreground text-xs font-medium"
          >
            Type
          </Label>
          <Select
            value={scopeType}
            onValueChange={(v) => setScopeType(v as ScopeType)}
          >
            <SelectTrigger
              id={`${formId}-type`}
              className="h-11"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPE_TYPES.map((t) => (
                <SelectItem
                  key={t}
                  value={t}
                >
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`${formId}-id`}
            className="text-muted-foreground text-xs font-medium"
          >
            ID
          </Label>
          <Input
            id={`${formId}-id`}
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            placeholder="e.g. VSDA, ACC, X7"
            className="h-9 font-mono"
            autoFocus
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={`${formId}-name`}
          className="text-muted-foreground text-xs font-medium"
        >
          Display name{" "}
          <span className="text-muted-foreground/60 font-normal normal-case">
            (optional)
          </span>
        </Label>
        <Input
          id={`${formId}-name`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Vehicle Software Development Acceleration"
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={`${formId}-aliases`}
          className="text-muted-foreground text-xs font-medium"
        >
          Aliases{" "}
          <span className="text-muted-foreground/60 font-normal normal-case">
            (comma-separated)
          </span>
        </Label>
        <Input
          id={`${formId}-aliases`}
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="vsda, deepagent"
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={`${formId}-access`}
          className="text-muted-foreground text-xs font-medium"
        >
          Default access
        </Label>
        <Select
          value={defaultAccess}
          onValueChange={(value) =>
            setDefaultAccess(value as ScopeDefaultAccess)
          }
        >
          <SelectTrigger
            id={`${formId}-access`}
            className="h-11"
            aria-label="Default scope access"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tier">
              By role · user read, developer/admin write
            </SelectItem>
            <SelectItem value="read">Read only · everyone</SelectItem>
            <SelectItem value="none">
              Private · explicit members only
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (!dirty || window.confirm("Discard this new scope?")) onCancel();
          }}
          className="flex-1"
        >
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
  userRoles,
}: {
  scope: MemoryScope;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: (next: MemoryScope) => void;
  userRoles: Record<string, Role>;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(scope.display_name ?? "");
  const [aliases, setAliases] = useState((scope.aliases ?? []).join(", "));
  const [defaultAccess, setDefaultAccess] = useState<ScopeDefaultAccess>(
    scope.default_access ?? "tier"
  );
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const [members, setMembers] = useState<ScopeMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberAccess, setNewMemberAccess] = useState<ScopeAccess>("read");
  const [adding, setAdding] = useState(false);

  // Monotonically increases each time the local membership is mutated locally
  // (add/remove) or a new load starts. A late-arriving load may only commit
  // its result if no newer mutation has happened in the meantime.
  const mutationGenRef = useRef(0);

  const editDirty =
    editing &&
    (displayName !== (scope.display_name ?? "") ||
      aliases !== (scope.aliases ?? []).join(", ") ||
      defaultAccess !== (scope.default_access ?? "tier"));
  useSettingsDraft(editDirty || !!newMemberName || saving || adding);

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
        default_access: defaultAccess,
      });
      onUpdated(result);
      setEditing(false);
      toast.success("Scope updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update scope"
      );
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
      toast.error(
        err instanceof Error ? err.message : "Failed to update access"
      );
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
      toast.error(
        err instanceof Error ? err.message : "Failed to remove member"
      );
    }
  };

  return (
    <article
      className={cn(
        "bg-card/60 rounded-lg border transition-colors",
        isOpen
          ? "col-span-full border-(--aptiv-orange)/40 shadow-sm"
          : "hover:border-primary/30 border-border"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group hover:bg-muted/40 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
        aria-expanded={isOpen}
      >
        <span
          className="h-7 w-1 shrink-0 rounded-full"
          style={{ background: scopeTypeColor(scope.scope_type) }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground truncate font-mono text-sm font-semibold tracking-tight">
              {scope.scope_id}
            </span>
            {scope.display_name && (
              <span className="text-muted-foreground truncate text-xs">
                {scope.display_name}
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <span className="font-semibold tracking-wider uppercase">
              {scope.member_count ?? 0} member
              {(scope.member_count ?? 0) === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{scopeDefaultAccessLabel(scope.default_access)}</span>
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
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
            isOpen && "rotate-90"
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="border-border/60 space-y-4 border-t px-3 py-3">
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
                className="text-destructive hover:bg-destructive/10 hover:text-destructive flex-1"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label
                  htmlFor={`${formId}-name`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Display name
                </Label>
                <Input
                  id={`${formId}-name`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor={`${formId}-aliases`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Aliases
                </Label>
                <Input
                  id={`${formId}-aliases`}
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  className="h-9"
                  placeholder="comma-separated"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor={`${formId}-access`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Default access
                </Label>
                <Select
                  value={defaultAccess}
                  onValueChange={(value) =>
                    setDefaultAccess(value as ScopeDefaultAccess)
                  }
                >
                  <SelectTrigger
                    id={`${formId}-access`}
                    className="h-11"
                    aria-label="Default scope access"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tier">By role</SelectItem>
                    <SelectItem value="read">Read only</SelectItem>
                    <SelectItem value="none">Explicit members only</SelectItem>
                  </SelectContent>
                </Select>
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
                    setDefaultAccess(scope.default_access ?? "tier");
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
              <p className="border-border bg-muted/30 text-muted-foreground rounded-md border border-dashed px-3 py-3 text-center text-xs">
                No members yet. Add one below.
              </p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => {
                  const role = userRoles[m.username] ?? "user";
                  return (
                    <li
                      key={m.username}
                      className="border-border/60 bg-card/40 flex items-center gap-2 rounded-md border px-2.5 py-1.5"
                    >
                      <RoleBadge role={role} />
                      <span className="flex-1 truncate text-xs font-medium">
                        {m.username}
                      </span>
                      <Select
                        value={m.access}
                        onValueChange={(v) =>
                          handleMemberAccessChange(m.username, v as ScopeAccess)
                        }
                      >
                        <SelectTrigger
                          aria-label={`Access for ${m.username}`}
                          className="h-11 w-[100px] gap-1 px-2 text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="read"
                            className="text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <Eye className="h-3.5 w-3.5" />
                              read
                            </span>
                          </SelectItem>
                          <SelectItem
                            value="write"
                            className="text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <Pencil className="h-3.5 w-3.5" />
                              write
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.username)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md p-1 transition-colors"
                        aria-label={`Remove ${m.username}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center gap-1.5 pt-1">
              <Input
                aria-label="New member username"
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
                <SelectTrigger
                  aria-label="New member access"
                  className="h-11 w-[100px] gap-1 px-2 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="read"
                    className="text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      read
                    </span>
                  </SelectItem>
                  <SelectItem
                    value="write"
                    className="text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" />
                      write
                    </span>
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

function scopeDefaultAccessLabel(
  access: ScopeDefaultAccess | undefined
): string {
  switch (access) {
    case "none":
      return "private";
    case "read":
      return "read only";
    case "tier":
    default:
      return "role access";
  }
}
