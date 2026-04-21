"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  X,
  LogOut,
  User,
  Shield,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  Save,
  CheckCircle,
} from "lucide-react";
import {
  isAdmin,
  apiGetRunMode,
  apiUpdateRunMode,
  apiListUsers,
  apiUpdateUserRole,
  apiUpdateProfile,
  AdminUser,
  RunModeInfo,
} from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";

interface UserManagementSidebarProps {
  onClose: () => void;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export function UserManagementSidebar({ onClose }: UserManagementSidebarProps) {
  const { user, logout, updateUser } = useAuth();

  // --- Change username ---
  const [newUsername, setNewUsername] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const usernameSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [runModeInfo, setRunModeInfo] = useState<RunModeInfo | null>(null);
  const [isChangingRunMode, setIsChangingRunMode] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  const fetchAdminData = useCallback(async () => {
    if (!isAdmin(user)) return;
    setIsLoadingAdmin(true);
    try {
      const [modeInfo, users] = await Promise.all([
        apiGetRunMode(),
        apiListUsers(),
      ]);
      setRunModeInfo(modeInfo);
      setAdminUsers(users);
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
    return () => {
      if (usernameSavedTimeoutRef.current) {
        clearTimeout(usernameSavedTimeoutRef.current);
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

  const handleRunModeChange = async (mode: "dev" | "pre" | "prod") => {
    setIsChangingRunMode(true);
    try {
      const updated = await apiUpdateRunMode(mode);
      setRunModeInfo(updated);
      toast.success(`Run mode set to "${updated.run_mode}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update run mode");
    } finally {
      setIsChangingRunMode(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, role: "user" | "admin") => {
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

  const handleSaveUsername = async () => {
    if (!trimmedUsername || trimmedUsername === user?.username || usernameValidationError) return;
    setIsSavingUsername(true);
    try {
      const result = await apiUpdateProfile({ username: trimmedUsername });
      updateUser({
        user_id: result.user_id,
        username: result.username,
        role: result.role,
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
                <p className="truncate text-xs text-muted-foreground">
                  ID: {user?.user_id?.slice(0, 8)}...
                </p>
              </div>
            </div>
          </div>

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
                  {/* Run Mode */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Run Mode</Label>
                    <select
                      value={runModeInfo?.run_mode ?? ""}
                      onChange={(e) =>
                        handleRunModeChange(e.target.value as "dev" | "pre" | "prod")
                      }
                      disabled={isChangingRunMode || !runModeInfo}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      aria-label="Run mode"
                    >
                      <option value="dev">dev</option>
                      <option value="pre">pre</option>
                      <option value="prod">prod</option>
                    </select>
                    {runModeInfo?.last_updated_at && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Updated: {runModeInfo.last_updated_at}
                      </p>
                    )}
                  </div>

                  {/* User Role Management */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">User Roles</Label>
                    <div className="space-y-1.5">
                      {adminUsers.map((u) => (
                        <div
                          key={u.user_id}
                          className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <span className="flex-1 truncate text-sm">{u.username}</span>
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleRoleChange(u.user_id, e.target.value as "user" | "admin")
                            }
                            disabled={u.user_id === user?.user_id}
                            className="rounded border border-input bg-background px-2 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                            aria-label={`Role for ${u.username}`}
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
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
