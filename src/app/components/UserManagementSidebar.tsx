"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  X,
  LogOut,
  User,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
  Trash2,
  KeyRound,
  Download,
} from "lucide-react";
import {
  isAdmin,
  apiListUsers,
  apiUpdateUserRole,
  apiUpdateProfile,
  apiGetProfile,
  apiGetTierModels,
  apiSetTierModels,
  apiDeleteUser,
  apiResetPassword,
  apiResetAllPasswords,
  AdminUser,
  TierModelEntry,
  Role,
} from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";
import { ModelSelector } from "./ModelSelector";

interface UserManagementSidebarProps {
  onClose: () => void;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const APTIV_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@aptiv\.com$/i;
const ROLES: Role[] = ["user", "developer", "admin"];

export function UserManagementSidebar({ onClose }: UserManagementSidebarProps) {
  const { user, logout, updateUser } = useAuth();

  // --- Change username ---
  const [newUsername, setNewUsername] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const usernameSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Change email ---
  const [profileEmail, setProfileEmail] = useState<string>(user?.email ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const emailSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Change password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const passwordSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Admin state ---
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [tierAllowlists, setTierAllowlists] = useState<Record<Role, TierModelEntry[]>>({
    user: [],
    developer: [],
    admin: [],
  });
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!isAdmin(user)) return;
    setIsLoadingAdmin(true);
    try {
      const [users, userAllowlist, developerAllowlist, adminAllowlist] = await Promise.all([
        apiListUsers(),
        apiGetTierModels("user"),
        apiGetTierModels("developer"),
        apiGetTierModels("admin"),
      ]);
      setAdminUsers(users);
      setTierAllowlists({
        user: userAllowlist.models,
        developer: developerAllowlist.models,
        admin: adminAllowlist.models,
      });
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  useEffect(() => {
    let active = true;
    apiGetProfile()
      .then((profile) => {
        if (active) {
          setProfileEmail(profile.email ?? "");
        }
      })
      .catch(() => {
        // Profile fetch failures are surfaced by protected API calls elsewhere.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (usernameSavedTimeoutRef.current) {
        clearTimeout(usernameSavedTimeoutRef.current);
      }
      if (emailSavedTimeoutRef.current) {
        clearTimeout(emailSavedTimeoutRef.current);
      }
      if (passwordSavedTimeoutRef.current) {
        clearTimeout(passwordSavedTimeoutRef.current);
      }
    };
  }, []);

  const trimmedUsername = newUsername.trim();
  const usernameValidationError =
    trimmedUsername.length === 0
      ? ""
      : trimmedUsername.length < 3
      ? "Username must be at least 3 characters"
      : !USERNAME_PATTERN.test(trimmedUsername)
      ? "Username may only contain letters, digits, underscores, hyphens, and dots"
      : "";

  const trimmedEmail = newEmail.trim().toLowerCase();
  const emailValidationError =
    trimmedEmail.length === 0
      ? ""
      : !APTIV_EMAIL_PATTERN.test(trimmedEmail)
      ? "Email must be a valid @aptiv.com address"
      : "";

  const handleRoleChange = async (targetUserId: string, role: Role) => {
    if (targetUserId === user?.user_id && role !== "admin") {
      toast.error("You cannot demote yourself");
      return;
    }
    try {
      const updated = await apiUpdateUserRole(targetUserId, role);
      setAdminUsers((prev) =>
        prev.map((u) =>
          u.user_id === targetUserId ? { ...u, role: updated.role } : u
        )
      );
      toast.success(`Updated ${updated.username} to "${updated.role}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleDeleteUser = async (targetUser: AdminUser) => {
    if (targetUser.user_id === user?.user_id) return;
    if (!confirm(`Delete user ${targetUser.username}? This cannot be undone.`)) return;

    try {
      await apiDeleteUser(targetUser.user_id);
      setAdminUsers((prev) => prev.filter((u) => u.user_id !== targetUser.user_id));
      toast.success(`Deleted ${targetUser.username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleResetPassword = async (targetUser: AdminUser) => {
    try {
      const reset = await apiResetPassword(targetUser.user_id);

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(reset.temporary_password);
        toast.success("Temporary password copied to clipboard");
        return;
      }

      const content = `username\ttemporary_password\n${reset.username}\t${reset.temporary_password}\n`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `temp-password-${reset.username}.txt`;
      try {
        document.body.appendChild(link);
        link.click();
      } finally {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      toast.success(
        "Temporary password reset; downloaded a file containing the temporary password"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  const handleResetAllPasswords = async () => {
    if (!confirm("Reset passwords for all non-admin users?")) return;

    try {
      const resets = await apiResetAllPasswords();
      const rows = ["username\ttemporary_password"].concat(
        resets.map((reset) => `${reset.username}\t${reset.temporary_password}`)
      );
      const blob = new Blob([rows.join("\n")], { type: "text/tab-separated-values" });
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
      toast.success(`Reset ${resets.length} password(s); file downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset passwords");
    }
  };

  const handleSaveUsername = async () => {
    if (!trimmedUsername || trimmedUsername === user?.username || usernameValidationError) return;
    setIsSavingUsername(true);
    try {
      const result = await apiUpdateProfile({ username: trimmedUsername });
      updateUser({
        user_id: result.user_id,
        username: result.username,
        role: result.role,
        email: result.email ?? user?.email,
        access_token: result.access_token,
      });
      setNewUsername("");
      setUsernameSaved(true);
      toast.success("Username updated successfully");
      if (usernameSavedTimeoutRef.current) {
        clearTimeout(usernameSavedTimeoutRef.current);
      }
      usernameSavedTimeoutRef.current = setTimeout(() => {
        setUsernameSaved(false);
        usernameSavedTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update username");
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!trimmedEmail || trimmedEmail === profileEmail || emailValidationError) return;
    setIsSavingEmail(true);
    try {
      const result = await apiUpdateProfile({ email: trimmedEmail });
      updateUser({
        user_id: result.user_id,
        username: result.username,
        role: result.role,
        email: result.email ?? trimmedEmail,
        access_token: result.access_token,
      });
      setProfileEmail(result.email ?? trimmedEmail);
      setNewEmail("");
      setEmailSaved(true);
      toast.success("Email updated successfully");
      if (emailSavedTimeoutRef.current) {
        clearTimeout(emailSavedTimeoutRef.current);
      }
      emailSavedTimeoutRef.current = setTimeout(() => {
        setEmailSaved(false);
        emailSavedTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setIsSavingPassword(true);
    try {
      const result = await apiUpdateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      updateUser({
        user_id: result.user_id,
        username: result.username,
        role: result.role,
        email: result.email ?? user?.email,
        access_token: result.access_token,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      toast.success("Password updated successfully");
      if (passwordSavedTimeoutRef.current) {
        clearTimeout(passwordSavedTimeoutRef.current);
      }
      passwordSavedTimeoutRef.current = setTimeout(() => {
        setPasswordSaved(false);
        passwordSavedTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">User Management</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close user management sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-6 p-4">
          {/* User info card */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">{user?.username}</p>
                <p className="truncate text-xs text-muted-foreground uppercase">
                  Role: {user?.role || "user"}
                </p>
                {profileEmail && (
                  <p className="truncate text-xs text-muted-foreground">
                    {profileEmail}
                  </p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  ID: {user?.user_id?.slice(0, 8)}...
                </p>
              </div>
            </div>
          </div>

          {/* Model selection */}
          {user?.role && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Model</h3>
              <ModelSelector />
            </div>
          )}

          {/* Change Username */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Change Username</h3>
            <div className="space-y-1.5">
              <Label htmlFor="newUsername" className="text-sm font-medium">
                New Username
              </Label>
              <Input
                id="newUsername"
                type="text"
                placeholder={user?.username ?? "Enter new username"}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoComplete="off"
              />
              {usernameValidationError && (
                <p className="text-xs text-destructive">{usernameValidationError}</p>
              )}
            </div>
            <Button
              onClick={handleSaveUsername}
              disabled={
                isSavingUsername ||
                !trimmedUsername ||
                trimmedUsername === user?.username ||
                !!usernameValidationError
              }
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingUsername ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : usernameSaved ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Username
                </>
              )}
            </Button>
          </div>

          {/* Change Email */}
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Aptiv Email</h3>
            <div className="space-y-1.5">
              <Label htmlFor="newEmail" className="text-sm font-medium">
                Current: {profileEmail || "Not set"}
              </Label>
              <Input
                id="newEmail"
                type="email"
                placeholder={profileEmail || "first.last@aptiv.com"}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
              {emailValidationError && (
                <p className="text-xs text-destructive">{emailValidationError}</p>
              )}
            </div>
            <Button
              onClick={handleSaveEmail}
              disabled={
                isSavingEmail ||
                !trimmedEmail ||
                trimmedEmail === profileEmail ||
                !!emailValidationError
              }
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingEmail ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : emailSaved ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Email
                </>
              )}
            </Button>
          </div>

          {/* Change Password */}
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Change Password</h3>

            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" className="text-sm font-medium">
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPw ? "text" : "password"}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showCurrentPw ? "Hide current password" : "Show current password"}
                  aria-pressed={showCurrentPw}
                >
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPw ? "text" : "password"}
                  placeholder="Enter new password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showNewPw ? "Hide new password" : "Show new password"}
                  aria-pressed={showNewPw}
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPw ? "text" : "password"}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPw ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirmPw}
                >
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              onClick={handleSavePassword}
              disabled={
                isSavingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : passwordSaved ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Password
                </>
              )}
            </Button>
          </div>

          {/* Admin Panel */}
          {isAdmin(user) && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Admin
                </h3>
              </div>

              {isLoadingAdmin ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* User Role Management */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">User Roles</Label>
                    <div className="space-y-1.5">
                      {adminUsers.map((u) => (
                        <div
                          key={u.user_id}
                          className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate text-sm">{u.username}</span>
                            <select
                              value={u.role}
                              onChange={(e) =>
                                handleRoleChange(u.user_id, e.target.value as Role)
                              }
                              disabled={u.user_id === user?.user_id}
                              className="rounded border border-input bg-background px-2 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
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
                              onClick={() => handleDeleteUser(u)}
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
                  </div>

                  <div className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Tier Model Allowlists</h4>
                    {ROLES.map((role) => (
                      <TierAllowlistEditor
                        key={role}
                        tier={role}
                        entries={tierAllowlists[role]}
                        onSaved={(next) =>
                          setTierAllowlists((prev) => ({ ...prev, [role]: next }))
                        }
                      />
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleResetAllPasswords}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Reset all non-admin passwords
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Logout */}
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TierAllowlistEditor({
  tier,
  entries,
  onSaved,
}: {
  tier: Role;
  entries: TierModelEntry[];
  onSaved: (next: TierModelEntry[]) => void;
}) {
  const [text, setText] = useState(
    entries.map((entry) => `${entry.provider}:${entry.model}`).join("\n")
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setText(entries.map((entry) => `${entry.provider}:${entry.model}`).join("\n"));
  }, [entries]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsed = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const separatorIndex = line.indexOf(":");
          const provider = line.slice(0, separatorIndex).trim();
          const model = line.slice(separatorIndex + 1).trim();

          if (separatorIndex <= 0 || !provider || !model) {
            throw new Error(`Invalid model entry: ${line}`);
          }

          return { provider, model };
        });

      const updated = await apiSetTierModels(tier, parsed);
      onSaved(updated.models);
      toast.success(`${tier} tier allowlist saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save allowlist");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={`tier-allowlist-${tier}`}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {tier}
      </Label>
      <Textarea
        id={`tier-allowlist-${tier}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(2, entries.length + 1)}
        placeholder="provider:model (one per line)"
        className="min-h-[72px] font-mono text-xs"
      />
      <Button
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Save {tier} allowlist
          </>
        )}
      </Button>
    </div>
  );
}
