"use client";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGetTokens, apiUpdateTokens, UserTokens } from "@/lib/auth";
import { useNotifications } from "@/app/hooks/useNotifications";
import {
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Whether a token's `updated_at` value is meaningful enough to show the
 * "Updated …" block. We treat falsy values, an empty string, or the sentinel
 * "Unknown" returned by the backend as "no record yet". This protects against
 * older deployments that omit a field or send an empty string instead of
 * "Unknown" — the previous `!== "Unknown"` check would render "Updated  ()".
 */
function hasUpdatedAt(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "Unknown";
}

interface TokenManagementSidebarProps {
  /** Service key ("graph" | "jira" | "polarion" | "confluence") to focus on mount. */
  initialFocus?: string | null;
  /** Called once after the initialFocus has been consumed so the parent
   *  doesn't keep re-focusing on every render. */
  onFocusConsumed?: () => void;
}

export function TokenManagementSidebar({
  initialFocus,
  onFocusConsumed,
}: TokenManagementSidebarProps) {
  const { applyClearedNotifications } = useNotifications();
  const [graphToken, setGraphToken] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  // Track whether the user has edited each token field since load.
  // Only send a token to the backend if the user actually typed something,
  // so we never accidentally overwrite a stored token with an empty string.
  const [graphDirty, setGraphDirty] = useState(false);
  const [jiraDirty, setJiraDirty] = useState(false);
  const [showGraphToken, setShowGraphToken] = useState(false);
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [polarionAsuxToken, setPolarionAsuxToken] = useState("");
  const [polarionAsuxDirty, setPolarionAsuxDirty] = useState(false);
  const [showPolarionAsuxToken, setShowPolarionAsuxToken] = useState(false);
  const [polarionProd1Token, setPolarionProd1Token] = useState("");
  const [polarionProd1Dirty, setPolarionProd1Dirty] = useState(false);
  const [showPolarionProd1Token, setShowPolarionProd1Token] = useState(false);
  const [confluenceToken, setConfluenceToken] = useState("");
  const [confluenceDirty, setConfluenceDirty] = useState(false);
  const [showConfluenceToken, setShowConfluenceToken] = useState(false);
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
      setPolarionAsuxDirty(false);
      setPolarionProd1Dirty(false);
      setConfluenceDirty(false);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  // When the sidebar opens via a banner action, scroll the matching token
  // input into view and focus it. Wait for the inputs to render (isLoading
  // → false), then consume the focus request so the parent state clears.
  useEffect(() => {
    if (!initialFocus || isLoading) return;
    const targetId = `${initialFocus}Token`;
    const el = document.getElementById(targetId) as HTMLInputElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
    onFocusConsumed?.();
  }, [initialFocus, isLoading, onFocusConsumed]);

  const handleSave = async () => {
    if (!graphDirty && !jiraDirty && !polarionAsuxDirty && !polarionProd1Dirty && !confluenceDirty) return;
    setIsSaving(true);
    try {
      // Only send tokens the user actually edited to avoid clearing the other
      const payload: {
        graph_api_token?: string;
        jira_api_token?: string;
        polarion_asux_api_token?: string;
        polarion_prod1_api_token?: string;
        confluence_api_token?: string;
      } = {};
      if (graphDirty) payload.graph_api_token = graphToken;
      if (jiraDirty) payload.jira_api_token = jiraToken;
      if (polarionAsuxDirty) payload.polarion_asux_api_token = polarionAsuxToken;
      if (polarionProd1Dirty) payload.polarion_prod1_api_token = polarionProd1Token;
      if (confluenceDirty) payload.confluence_api_token = confluenceToken;
      const updated = await apiUpdateTokens(payload);
      setTokenMeta(updated);
      // PUT /api/user/tokens returns `cleared_notifications` for any
      // active token-expired banner that this update resolves. Drop those
      // banners locally without a follow-up GET.
      if (updated.cleared_notifications?.length) {
        applyClearedNotifications(updated.cleared_notifications);
      }
      setGraphToken("");
      setJiraToken("");
      setGraphDirty(false);
      setJiraDirty(false);
      setPolarionAsuxToken("");
      setPolarionAsuxDirty(false);
      setPolarionProd1Token("");
      setPolarionProd1Dirty(false);
      setConfluenceToken("");
      setConfluenceDirty(false);
      setSavedIndicator(true);
      toast.success("Tokens updated successfully");
      setTimeout(() => setSavedIndicator(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tokens");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Title bar is supplied by parent WorkspacePanel. */}
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
                {tokenMeta && hasUpdatedAt(tokenMeta.graph_api_token_updated_at) && (
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
                {tokenMeta && hasUpdatedAt(tokenMeta.jira_api_token_updated_at) && (
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

              {/* Polarion ASUX Token */}
              <div className="space-y-2">
                <Label htmlFor="polarion_asuxToken" className="text-sm font-medium">
                  Polarion (ASUX) Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for Polarion ASUX server work item integration
                </p>
                {tokenMeta && tokenMeta.polarion_asux_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.polarion_asux_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta &&
                  hasUpdatedAt(tokenMeta.polarion_asux_api_token_updated_at) && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.polarion_asux_api_token_updated_at}
                      >
                        {formatTimestamp(
                          tokenMeta.polarion_asux_api_token_updated_at,
                        )}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.polarion_asux_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="polarion_asuxToken"
                    type={showPolarionAsuxToken ? "text" : "password"}
                    placeholder="Enter your Polarion ASUX token"
                    value={polarionAsuxToken}
                    onChange={(e) => {
                      setPolarionAsuxToken(e.target.value);
                      setPolarionAsuxDirty(true);
                    }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPolarionAsuxToken(!showPolarionAsuxToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPolarionAsuxToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Polarion Prod1 Token */}
              <div className="space-y-2">
                <Label htmlFor="polarion_prod1Token" className="text-sm font-medium">
                  Polarion (Prod1) Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for Polarion Prod1 server work item integration
                </p>
                {tokenMeta && tokenMeta.polarion_prod1_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.polarion_prod1_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta &&
                  hasUpdatedAt(tokenMeta.polarion_prod1_api_token_updated_at) && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.polarion_prod1_api_token_updated_at}
                      >
                        {formatTimestamp(
                          tokenMeta.polarion_prod1_api_token_updated_at,
                        )}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.polarion_prod1_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="polarion_prod1Token"
                    type={showPolarionProd1Token ? "text" : "password"}
                    placeholder="Enter your Polarion Prod1 token"
                    value={polarionProd1Token}
                    onChange={(e) => {
                      setPolarionProd1Token(e.target.value);
                      setPolarionProd1Dirty(true);
                    }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPolarionProd1Token(!showPolarionProd1Token)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPolarionProd1Token ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confluence API Token */}
              <div className="space-y-2">
                <Label htmlFor="confluenceToken" className="text-sm font-medium">
                  Confluence API Token
                </Label>
                <p className="text-xs text-muted-foreground">
                  Used for retrieving Confluence spaces, pages, and attachments.
                </p>
                {tokenMeta && tokenMeta.confluence_api_token_preview && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="text-xs font-mono text-foreground">
                      {tokenMeta.confluence_api_token_preview}
                    </code>
                  </div>
                )}
                {tokenMeta &&
                  hasUpdatedAt(tokenMeta.confluence_api_token_updated_at) && (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-foreground/80">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Updated
                      </span>
                      <time
                        className="font-mono tabular-nums"
                        dateTime={tokenMeta.confluence_api_token_updated_at}
                      >
                        {formatTimestamp(
                          tokenMeta.confluence_api_token_updated_at,
                        )}
                      </time>
                      <span className="text-muted-foreground/80">
                        ({tokenMeta.confluence_api_token_time_gap})
                      </span>
                    </div>
                  )}
                <div className="relative">
                  <Input
                    id="confluenceToken"
                    type={showConfluenceToken ? "text" : "password"}
                    placeholder="Enter your Confluence API token"
                    value={confluenceToken}
                    onChange={(e) => {
                      setConfluenceToken(e.target.value);
                      setConfluenceDirty(true);
                    }}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfluenceToken(!showConfluenceToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfluenceToken ? (
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
                  isSaving ||
                  (!graphDirty &&
                    !jiraDirty &&
                    !polarionAsuxDirty &&
                    !polarionProd1Dirty &&
                    !confluenceDirty)
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
