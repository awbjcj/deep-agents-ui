"use client";

import { MeterFill } from "@/components/ui/meter-fill";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Ellipsis,
  KeyRound,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { UsageDimensionToggle } from "@/app/components/UsageDimensionToggle";
import { roleVisual } from "@/app/utils/roleVisual";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useAuth } from "@/providers/AuthProvider";
import {
  DisclosureSection,
  EmptyState,
  LoadingRow,
} from "@/app/components/admin/primitives";
import { ROLES, downloadBlob } from "@/app/components/admin/primitives-utils";
import { SETTINGS_CARD_GRID } from "@/app/components/settings/SettingsLayout";

export function UsersSection({ revision = 0 }: { revision?: number }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  // The review revision of the list currently shown; usage refreshes follow
  // it so one completed review triggers one usage reload.
  const [usersRevision, setUsersRevision] = useState(revision);
  const [usage, setUsage] = useState<Record<string, AdminUserUsage>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [usageView, setUsageView] = useState<UsageDimension>("tokens");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    apiListUsers(signal)
      .then((list) => {
        if (signal.aborted) return;
        setUsers(list);
        setUsersRevision(revision);
      })
      .catch(() => {
        if (!signal.aborted) toast.error("Failed to load users");
      })
      .finally(() => {
        if (!signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  // Watch the set of usernames and completed review revisions so an ordinary
  // role edit does not reload every usage meter.
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
  }, [usernameKey, usersRevision]);

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
        "Clipboard unavailable, so the temporary password was downloaded instead"
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

  // Admin quota review starts with the most directly comparable dimension.
  // The toggle still lets an admin inspect calls or estimated cost on demand.
  const usageDim = usageView;

  return (
    <div className="space-y-4">
      <DisclosureSection
        title="Accounts"
        subtitle={
          isLoading
            ? undefined
            : `${users.length} ${users.length === 1 ? "account" : "accounts"}`
        }
        icon={Users}
        contentClassName="space-y-3"
      >
        {isLoading ? (
          <LoadingRow compact />
        ) : users.length === 0 ? (
          <EmptyState title="No accounts found" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground m-0 text-xs font-medium">
                Weekly usage
              </p>
              <UsageDimensionToggle
                value={usageDim}
                onChange={setUsageView}
              />
            </div>

            <ul className={`m-0 list-none p-0 ${SETTINGS_CARD_GRID}`}>
              {users.map((account) => {
                const accountUsage = usage[account.username];
                const isSelf = account.user_id === user?.user_id;
                const { Icon: RoleIcon, color: roleColor } = roleVisual(
                  account.role
                );
                return (
                  <li
                    key={account.user_id}
                    className="border-border/60 bg-background/60 m-0 min-w-0 rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full"
                        style={{
                          color: roleColor,
                          background: `color-mix(in srgb, ${roleColor} 12%, transparent)`,
                        }}
                        aria-hidden="true"
                      >
                        <RoleIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 wrap-anywhere">
                        <p className="m-0 text-sm font-semibold">
                          {account.username}
                        </p>
                        <p className="text-muted-foreground m-0 text-xs capitalize">
                          {account.role}
                          {isSelf && (
                            <span className="normal-case"> · You</span>
                          )}
                        </p>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${account.username}`}
                            className="size-touch text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                          >
                            <Ellipsis
                              className="size-5"
                              aria-hidden="true"
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          collisionPadding={12}
                          aria-label={`Account actions for ${account.username}`}
                          className="w-64 max-w-(--radix-popover-content-available-width) p-1.5 data-[state=closed]:animate-none data-[state=open]:animate-none"
                        >
                          <p className="m-0 px-2.5 pt-1.5 pb-2 text-sm font-semibold wrap-anywhere">
                            {account.username}
                          </p>
                          {!isSelf && (
                            <div className="border-border/70 space-y-1.5 border-y px-2.5 py-2">
                              <Label
                                htmlFor={`account-role-${account.user_id}`}
                              >
                                Role
                              </Label>
                              <Select
                                value={account.role}
                                onValueChange={(role) =>
                                  void handleRoleChange(
                                    account.user_id,
                                    role as Role
                                  )
                                }
                              >
                                <SelectTrigger
                                  id={`account-role-${account.user_id}`}
                                  className="min-h-touch capitalize"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="capitalize">
                                  {ROLES.map((role) => (
                                    <SelectItem
                                      key={role}
                                      value={role}
                                    >
                                      {role}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="grid gap-0.5 pt-1">
                            {/* Your own password changes through Profile. */}
                            {!isSelf && (
                              <PopoverClose asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="min-h-touch justify-start"
                                  onClick={() =>
                                    void handleResetPassword(account)
                                  }
                                >
                                  <KeyRound aria-hidden="true" /> Reset password
                                </Button>
                              </PopoverClose>
                            )}
                            <PopoverClose asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-touch justify-start"
                                onClick={() => void handleResetUsage(account)}
                              >
                                <RotateCcw aria-hidden="true" /> Reset weekly
                                usage
                              </Button>
                            </PopoverClose>
                          </div>
                          {!isSelf && (
                            <div className="border-border/70 mt-1 border-t pt-1">
                              <PopoverClose asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/10 min-h-touch w-full justify-start"
                                  onClick={() => void handleDelete(account)}
                                >
                                  <Trash2 aria-hidden="true" /> Delete account
                                </Button>
                              </PopoverClose>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                    {accountUsage && (
                      <UsageStrip
                        usage={accountUsage}
                        override={usageDim}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DisclosureSection>

      <DisclosureSection
        title="Bulk account operations"
        contentClassName="space-y-2"
      >
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full text-xs text-(--aptiv-turquoise-dark) transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-(--aptiv-turquoise)/10 hover:text-(--aptiv-turquoise-dark) focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 dark:text-(--aptiv-turquoise) dark:hover:bg-(--aptiv-turquoise)/15 dark:hover:text-(--aptiv-turquoise)"
          onClick={handleResetAllUsage}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset all weekly usage
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-full text-xs transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={handleResetAll}
        >
          <Download className="mr-2 h-4 w-4" />
          Reset all non-admin passwords
        </Button>
      </DisclosureSection>
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
    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <div className="bg-muted h-1 min-w-12 flex-1 overflow-hidden rounded-full">
        <MeterFill
          percent={primary.isUnlimited ? 100 : primary.pct}
          className={
            primary.isUnlimited
              ? "bg-muted-foreground/40"
              : primary.pct >= 90
                ? "bg-destructive"
                : primary.pct >= 70
                  ? "bg-(--color-warning)"
                  : "bg-primary"
          }
        />
      </div>
      <span
        className="text-foreground max-w-full font-mono wrap-anywhere tabular-nums"
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
