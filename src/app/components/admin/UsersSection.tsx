"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UsageDimensionToggle } from "@/app/components/UsageDimensionToggle";
import { UsageLimitControls } from "@/app/components/admin/UsageLimitControls";
import { roleVisual } from "@/app/utils/roles";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminUser,
  AdminUserUsage,
  apiDeleteUser,
  apiGetUserUsage,
  apiListUsers,
  apiResetAllPasswords,
  apiResetAllUsage,
  apiResetPassword,
  apiResetUserUsage,
  apiUpdateUserRole,
  Role,
  TempPassword,
} from "@/lib/auth";
import {
  formatUsageAmount,
  splitUsageByEnforcement,
  type UsageDimension,
} from "@/lib/usage";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import {
  ActionPill,
  LoadingRow,
  ROLES,
  SectionHeader,
  downloadBlob,
} from "@/app/components/admin/primitives";

export function UsersSection() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<Record<string, AdminUserUsage>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [usageView, setUsageView] = useState<UsageDimension | null>(null);

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
      toast.error(
        err instanceof Error ? err.message : "Failed to reset password"
      );
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
    if (!confirm(`Reset weekly usage for ${target.username}?`)) return;
    try {
      await apiResetUserUsage(target.username);
      setUsage((prev) => {
        const next = { ...prev };
        if (next[target.username]) {
          next[target.username] = {
            ...next[target.username],
            used: 0,
            pct: 0,
            calls_used: 0,
            calls_pct: 0,
            cost_used_micros: 0,
            cost_used_usd: 0,
            cost_pct: 0,
          };
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
      toast.error(
        err instanceof Error ? err.message : "Failed to reset passwords"
      );
    }
  };

  const handleResetAllUsage = async () => {
    if (!confirm("Reset weekly usage for ALL users?")) return;
    try {
      const { reset } = await apiResetAllUsage();
      setUsage((prev) => {
        const next: Record<string, AdminUserUsage> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = {
            ...v,
            used: 0,
            pct: 0,
            calls_used: 0,
            calls_pct: 0,
            cost_used_micros: 0,
            cost_used_usd: 0,
            cost_pct: 0,
          };
        }
        return next;
      });
      toast.success(`Reset usage for ${reset} user(s)`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reset all usage"
      );
    }
  };

  // Default to the backend's run-mode display dimension; the toggle lets an
  // admin inspect any tracked weekly usage dimension.
  const usageDim: UsageDimension =
    usageView ?? Object.values(usage).find(Boolean)?.enforced ?? "tokens";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader
          title="People"
          subtitle={`${users.length} ${
            users.length === 1 ? "account" : "accounts"
          } in this workspace`}
        />
        <div title="Which weekly cap the usage bars show">
          <UsageDimensionToggle
            value={usageDim}
            onChange={setUsageView}
          />
        </div>
      </div>

      <UsageLimitControls />

      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const u_usage = usage[u.username];
            const isSelf = u.user_id === user?.user_id;
            const { Icon: RoleIcon, color: roleColor } = roleVisual(u.role);
            return (
              <article
                key={u.user_id}
                className="aptiv-glass-soft rounded-lg p-2.5 shadow-sm transition-[background-color,border-color] duration-150 hover:bg-muted/50"
              >
                <header className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border"
                    style={{
                      color: roleColor,
                      borderColor: `color-mix(in srgb, ${roleColor} 40%, transparent)`,
                      background: `color-mix(in srgb, ${roleColor} 12%, transparent)`,
                    }}
                    title={u.role}
                  >
                    <RoleIcon className="h-3.5 w-3.5" />
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
                    onValueChange={(v) =>
                      handleRoleChange(u.user_id, v as Role)
                    }
                    disabled={isSelf}
                  >
                    <SelectTrigger
                      className="h-7 w-[110px] gap-1.5 px-2 text-xs"
                      aria-label={`Role for ${u.username}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => {
                        const { Icon: OptIcon } = roleVisual(role);
                        return (
                          <SelectItem
                            key={role}
                            value={role}
                            className="text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <OptIcon className="h-3.5 w-3.5" />
                              {role}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </header>

                {u_usage && (
                  <UsageStrip
                    usage={u_usage}
                    override={usageDim}
                  />
                )}

                <div className="mt-2 grid grid-cols-3 gap-1.5">
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

      <div className="aptiv-glass-soft space-y-2 rounded-lg p-2.5">
        <p className="aptiv-eyebrow">Bulk operations</p>
        <Button
          type="button"
          variant="outline"
          className="hover:bg-[var(--aptiv-turquoise)]/10 dark:hover:bg-[var(--aptiv-turquoise)]/15 h-8 w-full text-xs text-[var(--aptiv-turquoise-dark)] transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:text-[var(--aptiv-turquoise-dark)] focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 dark:text-[var(--aptiv-turquoise)] dark:hover:text-[var(--aptiv-turquoise)]"
          onClick={handleResetAllUsage}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset all weekly usage
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full text-xs text-destructive transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-destructive/10 hover:text-destructive focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={handleResetAll}
        >
          <Download className="mr-2 h-4 w-4" />
          Reset all non-admin passwords
        </Button>
      </div>
    </div>
  );
}

/**
 * Per-user weekly usage strip. Renders a single meter for the selected cap
 * (`override`, from the panel's Tokens/Calls/Cost switch — defaulting to the
 * run-mode display dimension): a progress bar plus the dimension-labelled value.
 * Enabled caps are enforced server-side; the switch only chooses what is shown.
 */
function UsageStrip({
  usage,
  override,
}: {
  usage: AdminUserUsage;
  override?: UsageDimension;
}) {
  const { primary } = splitUsageByEnforcement(usage, override);
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full origin-left rounded-full transition-[width] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            primary.isUnlimited
              ? "bg-muted-foreground/40"
              : primary.pct >= 90
              ? "bg-destructive"
              : primary.pct >= 70
              ? "bg-[var(--color-warning)]"
              : "bg-primary"
          )}
          style={{
            width: primary.isUnlimited
              ? "100%"
              : `${Math.min(primary.pct, 100)}%`,
          }}
        />
      </div>
      <span
        className="whitespace-nowrap font-mono tabular-nums text-foreground"
        title={`Weekly ${primary.dimension} cap`}
      >
        {primary.dimension}{" "}
        {primary.isUnlimited
          ? `${formatUsageAmount(primary.used, primary.dimension)} / ∞`
          : `${formatUsageAmount(
              primary.used,
              primary.dimension
            )} / ${formatUsageAmount(
              primary.limit,
              primary.dimension
            )} · ${Math.round(primary.pct)}%`}
      </span>
    </div>
  );
}
