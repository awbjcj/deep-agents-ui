"use client";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGetTokens, apiUpdateTokens, UserTokens } from "@/lib/auth";
import {
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface TokenManagementSidebarProps {
  onClose: () => void;
}

export function TokenManagementSidebar({
  onClose,
}: TokenManagementSidebarProps) {
  const [graphToken, setGraphToken] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  // Track whether the user has edited each token field since load.
  // Only send a token to the backend if the user actually typed something,
  // so we never accidentally overwrite a stored token with an empty string.
  const [graphDirty, setGraphDirty] = useState(false);
  const [jiraDirty, setJiraDirty] = useState(false);
  const [showGraphToken, setShowGraphToken] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [polarionToken, setPolarionToken] = useState("");
  const [polarionDirty, setPolarionDirty] = useState(false);
  const [showPolarionToken, setShowPolarionToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<UserTokens | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const tokens = await apiGetTokens();
      // Backend only returns masked previews — never full token values.
      // Token input fields start empty; we only send values the user types.
      setTokenMeta(tokens);
      setGraphDirty(false);
      setJiraDirty(false);
      setPolarionDirty(false);
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
    if (!graphDirty && !jiraDirty && !polarionDirty) return;
    setIsSaving(true);
    try {
      // Only send tokens the user actually edited to avoid clearing the other
      const payload: {
        graph_api_token?: string;
        jira_api_token?: string;
        polarion_api_token?: string;
      } = {};
      if (graphDirty) payload.graph_api_token = graphToken;
      if (jiraDirty) payload.jira_api_token = jiraToken;
      if (polarionDirty) payload.polarion_api_token = polarionToken;
      const updated = await apiUpdateTokens(payload);
      setTokenMeta(updated);
      setGraphToken("");
      setJiraToken("");
      setGraphDirty(false);
      setJiraDirty(false);
      setPolarionToken("");
      setPolarionDirty(false);
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
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Graph API Token */}
              <div className="space-y-2">
                <Label htmlFor="graphToken" className="text-sm font-medium">
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
                {tokenMeta &&
                  tokenMeta.graph_api_token_updated_at !== "Unknown" && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.graph_api_token_updated_at}
                      >
                        {formatTimestamp(tokenMeta.graph_api_token_updated_at)}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.graph_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="graphToken"
                    type={showGraphToken ? "text" : "password"}
                    placeholder="Enter your Graph API token"
                    value={graphToken}
                    onChange={(e) => {
                      setGraphToken(e.target.value);
                      setGraphDirty(true);
                    }}
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
                <Label htmlFor="jiraToken" className="text-sm font-medium">
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
                {tokenMeta &&
                  tokenMeta.jira_api_token_updated_at !== "Unknown" && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.jira_api_token_updated_at}
                      >
                        {formatTimestamp(tokenMeta.jira_api_token_updated_at)}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.jira_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="jiraToken"
                    type={showJiraToken ? "text" : "password"}
                    placeholder="Enter your JIRA API token"
                    value={jiraToken}
                    onChange={(e) => {
                      setJiraToken(e.target.value);
                      setJiraDirty(true);
                    }}
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

              {/* Polarion API Token */}
              <div className="space-y-2">
                <Label htmlFor="polarionToken" className="text-sm font-medium">
                  Polarion API Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for Polarion work item integration
                </p>
                {tokenMeta && tokenMeta.polarion_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.polarion_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta &&
                  tokenMeta.polarion_api_token_updated_at !== "Unknown" && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.polarion_api_token_updated_at}
                      >
                        {formatTimestamp(
                          tokenMeta.polarion_api_token_updated_at,
                        )}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.polarion_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="polarionToken"
                    type={showPolarionToken ? "text" : "password"}
                    placeholder="Enter your Polarion API token"
                    value={polarionToken}
                    onChange={(e) => {
                      setPolarionToken(e.target.value);
                      setPolarionDirty(true);
                    }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPolarionToken(!showPolarionToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPolarionToken ? (
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
                disabled={
                  isSaving || (!graphDirty && !jiraDirty && !polarionDirty)
                }
                className="w-full"
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
                    Save tokens
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
