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
} from "lucide-react";
import { apiGetTokens, apiUpdateTokens } from "@/lib/auth";
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
  const [showGraphToken, setShowGraphToken] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const tokens = await apiGetTokens();
      setGraphToken(tokens.graph_api_token);
      setJiraToken(tokens.jira_api_token);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiUpdateTokens({
        graph_api_token: graphToken,
        jira_api_token: jiraToken,
      });
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
                <div className="relative">
                  <Input
                    id="graphToken"
                    type={showGraphToken ? "text" : "password"}
                    placeholder="Enter your Graph API token"
                    value={graphToken}
                    onChange={(e) => setGraphToken(e.target.value)}
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
                <div className="relative">
                  <Input
                    id="jiraToken"
                    type={showJiraToken ? "text" : "password"}
                    placeholder="Enter your JIRA API token"
                    value={jiraToken}
                    onChange={(e) => setJiraToken(e.target.value)}
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
                disabled={isSaving}
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
