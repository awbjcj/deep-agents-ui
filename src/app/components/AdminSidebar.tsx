"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  KeyRound,
  Loader2,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminUser,
  Role,
  apiDeleteUser,
  apiGetTierModels,
  apiListUsers,
  apiResetAllPasswords,
  apiResetPassword,
  apiSetAllTierModels,
  apiUpdateUserRole,
  TierModelEntry,
} from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

const ROLES: Role[] = ["user", "developer", "admin"];

type TierMap = Record<Role, TierModelEntry[]>;
type TierTextMap = Record<Role, string>;

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

interface AdminSidebarProps {
  onClose: () => void;
}

export function AdminSidebar({ onClose }: AdminSidebarProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
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
  const [isSavingTiers, setIsSavingTiers] = useState(false);

  const fetchAdminData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, userTier, developerTier, adminTier] = await Promise.all([
        apiListUsers(),
        apiGetTierModels("user"),
        apiGetTierModels("developer"),
        apiGetTierModels("admin"),
      ]);
      setUsers(list);
      const next: TierMap = {
        user: userTier.models,
        developer: developerTier.models,
        admin: adminTier.models,
      };
      setTiers(next);
      setTierText(tierMapToText(next));
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdminData();
  }, [fetchAdminData]);

  const savedTierText = useMemo(() => tierMapToText(tiers), [tiers]);
  const tiersDirty =
    tierText.user !== savedTierText.user ||
    tierText.developer !== savedTierText.developer ||
    tierText.admin !== savedTierText.admin;

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
    try {
      const reset = await apiResetPassword(target.user_id);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reset.temporary_password);
        toast.success("Temporary password copied to clipboard");
      } else {
        const tsv = [
          "username\ttemporary_password",
          `${reset.username}\t${reset.temporary_password}`,
        ].join("\n");
        const blob = new Blob([tsv], { type: "text/tab-separated-values" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${reset.username}-temp-password.tsv`;
        try {
          document.body.appendChild(link);
          link.click();
        } finally {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        toast.success("Temporary password downloaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset passwords for all non-admin users?")) return;
    try {
      const resets = await apiResetAllPasswords();
      const tsv = ["username\ttemporary_password"]
        .concat(resets.map((r) => `${r.username}\t${r.temporary_password}`))
        .join("\n");
      const blob = new Blob([tsv], { type: "text/tab-separated-values" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "temp-passwords.tsv";
      try {
        document.body.appendChild(link);
        link.click();
      } finally {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      toast.success(`Reset ${resets.length} password(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset passwords");
    }
  };

  const handleSaveAllTiers = async () => {
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

    setIsSavingTiers(true);
    try {
      const updated = await apiSetAllTierModels(parsed);
      setTiers(updated);
      setTierText(tierMapToText(updated));
      toast.success("Tier allowlists saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tiers");
    } finally {
      setIsSavingTiers(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col leading-none">
            <span className="aptiv-eyebrow">Admin</span>
            <h2 className="text-lg font-semibold tracking-tight">
              Administration
            </h2>
            <span className="aptiv-rule" aria-hidden="true" />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close admin sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-6 p-4">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Users
              </h3>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {users.map((u) => (
                  <div
                    key={u.user_id}
                    className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-medium">
                        {u.username}
                      </span>
                      <select
                        value={u.role}
                        onChange={(e) =>
                          handleRoleChange(u.user_id, e.target.value as Role)
                        }
                        disabled={u.user_id === user?.user_id}
                        className="cursor-pointer rounded border border-input bg-background px-2 py-1 text-xs text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Role for ${u.username}`}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetPassword(u)}
                        className="h-8 flex-1 px-2 text-xs"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset PW
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(u)}
                        disabled={u.user_id === user?.user_id}
                        className="h-8 flex-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleResetAll}
            >
              <Download className="mr-2 h-4 w-4" />
              Reset all non-admin passwords
            </Button>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Tier model allowlists
            </h3>
            {ROLES.map((tier) => (
              <div key={tier} className="space-y-1.5">
                <Label
                  htmlFor={`tier-${tier}`}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {tier}
                </Label>
                <Textarea
                  id={`tier-${tier}`}
                  value={tierText[tier]}
                  onChange={(e) =>
                    setTierText((prev) => ({
                      ...prev,
                      [tier]: e.target.value,
                    }))
                  }
                  rows={Math.max(2, tiers[tier].length + 1)}
                  placeholder="provider:model (one per line)"
                  className="min-h-[72px] font-mono text-xs"
                />
              </div>
            ))}
            <Button
              type="button"
              onClick={handleSaveAllTiers}
              disabled={isSavingTiers || !tiersDirty}
              className="w-full"
            >
              {isSavingTiers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save tier allowlists
                </>
              )}
            </Button>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
