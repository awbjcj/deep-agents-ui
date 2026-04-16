"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Key,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  X,
  LogOut,
  User,
  Clock,
  Shield,
} from "lucide-react";
import {
  apiGetTokens,
  apiUpdateTokens,
  UserTokens,
  isAdmin,
  apiGetRunMode,
  apiUpdateRunMode,
  apiListUsers,
  apiUpdateUserRole,
  AdminUser,
  RunModeInfo,
} from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";

interface TokenManagementSidebarProps {
  onClose: () => void;
}

export function TokenManagementSidebar({
  onClose,
}: TokenManagementSidebarProps) {
  const { user, logout } = useAuth();

  const [graphToken, setGraphToken] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  // Track whether the user has edited each token field since load.
  // Only send a token to the backend if the user actually typed something,
  // so we never accidentally overwrite a stored token with an empty string.
  const [graphDirty, setGraphDirty] = useState(false);
  const [jiraDirty, setJiraDirty] = useState(false);
  const [showGraphToken, setShowGraphToken] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<UserTokens | null>(null);

  // Admin state
  const [runModeInfo, setRunModeInfo] = useState<RunModeInfo | null>(null);
  const [isChangingRunMode, setIsChangingRunMode] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const tokens = await apiGetTokens();
      // Backend only returns masked previews — never full token values.
      // Token input fields start empty; we only send values the user types.
      setTokenMeta(tokens);
      setGraphDirty(false);
      setJiraDirty(false);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

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

  const handleRoleChange = async (
    targetUserId: string,
    role: "user" | "admin"
  ) => {
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

  const handleSave = async () => {
    if (!graphDirty && !jiraDirty) return;
    setIsSaving(true);
    try {
      // Only send tokens the user actually edited to avoid clearing the other
      const payload: { graph_api_token?: string; jira_api_token?: string } = {};
      if (graphDirty) payload.graph_api_token = graphToken;
      if (jiraDirty) payload.jira_api_token = jiraToken;
      const updated = await apiUpdateTokens(payload);
      setTokenMeta(updated);
      setGraphToken("");
      setJiraToken("");
      setGraphDirty(false);
      setJiraDirty(false);
      setSavedIndicator(true);
      toast.success("Tokens updated successfully");
      setTimeout(() => setSavedIndicator(false), 2000);
    } catch {
      toast.error("Failed to update tokens");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">
            Token Management
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close token sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-6 p-4">
          {/* User info */}
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F6868] text-white">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user?.username}
                </p>
                <p className="truncate text-xs text-muted-foreground uppercase">
                  Role: {user?.role || "user"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  ID: {user?.user_id?.slice(0, 8)}...
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Graph API Token */}
              <div className="space-y-2">
                <Label
                  htmlFor="graphToken"
                  className="text-sm font-medium"
                >
                  Graph API Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for Microsoft Graph API integration
                </p>
                {tokenMeta && tokenMeta.graph_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.graph_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta && tokenMeta.graph_api_token_updated_at !== "Unknown" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Updated: {tokenMeta.graph_api_token_updated_at}</span>
                    <span className="text-muted-foreground/70">({tokenMeta.graph_api_token_time_gap})</span>
                  </div>
                )}
                <div className="relative">
                  <Input
                    id="graphToken"
                    type={showGraphToken ? "text" : "password"}
                    placeholder="Enter your Graph API token"
                    value={graphToken}
                    onChange={(e) => { setGraphToken(e.target.value); setGraphDirty(true); }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGraphToken(!showGraphToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showGraphToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* JIRA API Token */}
              <div className="space-y-2">
                <Label
                  htmlFor="jiraToken"
                  className="text-sm font-medium"
                >
                  JIRA API Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for JIRA project management integration
                </p>
                {tokenMeta && tokenMeta.jira_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.jira_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta && tokenMeta.jira_api_token_updated_at !== "Unknown" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Updated: {tokenMeta.jira_api_token_updated_at}</span>
                    <span className="text-muted-foreground/70">({tokenMeta.jira_api_token_time_gap})</span>
                  </div>
                )}
                <div className="relative">
                  <Input
                    id="jiraToken"
                    type={showJiraToken ? "text" : "password"}
                    placeholder="Enter your JIRA API token"
                    value={jiraToken}
                    onChange={(e) => { setJiraToken(e.target.value); setJiraDirty(true); }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJiraToken(!showJiraToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showJiraToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={isSaving || (!graphDirty && !jiraDirty)}
                className="w-full bg-[#2F6868] text-white hover:bg-[#2F6868]/90"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : savedIndicator ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Tokens
                  </>
                )}
              </Button>
            </>
          )}

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
                        handleRunModeChange(
                          e.target.value as "dev" | "pre" | "prod"
                        )
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
                          <span className="flex-1 truncate text-sm">
                            {u.username}
                          </span>
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleRoleChange(
                                u.user_id,
                                e.target.value as "user" | "admin"
                              )
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
