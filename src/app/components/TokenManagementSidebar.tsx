"use client";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGetTokens, apiUpdateTokens, UserTokens } from "@/lib/auth";
import { useNotifications } from "@/app/hooks/useNotifications";
import { useAuth } from "@/providers/AuthProvider";
import { canUseCodeAnalyzer } from "@/lib/agent-access";
import {
  getTokenGuide,
  OPEN_TOKEN_WIZARD_EVENT,
  TOKEN_SERVICE_GUIDES,
  type TokenServiceGuide,
} from "@/app/components/tokenServiceGuides";
import { TokenSetupGuide } from "@/app/components/tokenSetupGuides";
import { ScmCredentials } from "@/app/components/ScmCredentials";
import { CopilotCredentialPanel } from "@/app/components/CopilotCredentialPanel";
import { Eye, EyeOff, Loader2, Save, Wand2 } from "lucide-react";
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
  const { user } = useAuth();
  const username = user?.username ?? "";
  // SCM and Copilot credentials serve only the Code Analyzer.
  const codeAnalyzerAllowed = canUseCodeAnalyzer(user);
  const [graphToken, setGraphToken] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  // Track whether the user has edited each token field since load.
  // Only send a token to the backend if the user actually typed something,
  // so we never accidentally overwrite a stored token with an empty string.
  const [graphDirty, setGraphDirty] = useState(false);
  const [jiraDirty, setJiraDirty] = useState(false);
  const [polarionAsuxToken, setPolarionAsuxToken] = useState("");
  const [polarionAsuxDirty, setPolarionAsuxDirty] = useState(false);
  const [polarionProd1Token, setPolarionProd1Token] = useState("");
  const [polarionProd1Dirty, setPolarionProd1Dirty] = useState(false);
  const [confluenceToken, setConfluenceToken] = useState("");
  const [confluenceDirty, setConfluenceDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    const service =
      initialFocus === "polarion" ? "polarion_asux" : initialFocus;
    const targetId = `${service}Token`;
    const el = document.getElementById(targetId) as HTMLInputElement | null;
    if (el) {
      el.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      el.focus({ preventScroll: true });
    }
    onFocusConsumed?.();
  }, [initialFocus, isLoading, onFocusConsumed]);

  const handleSave = async () => {
    if (
      !graphDirty &&
      !jiraDirty &&
      !polarionAsuxDirty &&
      !polarionProd1Dirty &&
      !confluenceDirty
    )
      return;
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
      if (polarionAsuxDirty)
        payload.polarion_asux_api_token = polarionAsuxToken;
      if (polarionProd1Dirty)
        payload.polarion_prod1_api_token = polarionProd1Token;
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
      toast.success("Tokens saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update tokens"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const missingCount = TOKEN_SERVICE_GUIDES.filter(
    (guide) => !tokenMeta?.[guide.previewField]
  ).length;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Title bar is supplied by parent WorkspacePanel. */}
      <ScrollArea className="h-0 flex-1">
        <div className="space-y-5 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.dispatchEvent(new Event(OPEN_TOKEN_WIZARD_EVENT))
                  }
                  className="min-h-9"
                >
                  <Wand2
                    className="size-4"
                    aria-hidden="true"
                  />
                  Guided setup
                </Button>
                {tokenMeta && missingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {missingCount}{" "}
                    {missingCount === 1 ? "service needs" : "services need"} a
                    token
                  </span>
                )}
              </div>

              <fieldset
                disabled={isSaving}
                className="min-w-0 space-y-5"
              >
                <TokenField
                  guide={getTokenGuide("graph")}
                  username={username}
                  value={graphToken}
                  preview={tokenMeta?.graph_api_token_preview}
                  updatedAt={tokenMeta?.graph_api_token_updated_at}
                  timeGap={tokenMeta?.graph_api_token_time_gap}
                  onChange={(value) => {
                    setGraphToken(value);
                    setGraphDirty(true);
                  }}
                />
                <TokenField
                  guide={getTokenGuide("jira")}
                  username={username}
                  value={jiraToken}
                  preview={tokenMeta?.jira_api_token_preview}
                  updatedAt={tokenMeta?.jira_api_token_updated_at}
                  timeGap={tokenMeta?.jira_api_token_time_gap}
                  onChange={(value) => {
                    setJiraToken(value);
                    setJiraDirty(true);
                  }}
                />
                <TokenField
                  guide={getTokenGuide("polarion_asux")}
                  username={username}
                  value={polarionAsuxToken}
                  preview={tokenMeta?.polarion_asux_api_token_preview}
                  updatedAt={tokenMeta?.polarion_asux_api_token_updated_at}
                  timeGap={tokenMeta?.polarion_asux_api_token_time_gap}
                  onChange={(value) => {
                    setPolarionAsuxToken(value);
                    setPolarionAsuxDirty(true);
                  }}
                />
                <TokenField
                  guide={getTokenGuide("polarion_prod1")}
                  username={username}
                  value={polarionProd1Token}
                  preview={tokenMeta?.polarion_prod1_api_token_preview}
                  updatedAt={tokenMeta?.polarion_prod1_api_token_updated_at}
                  timeGap={tokenMeta?.polarion_prod1_api_token_time_gap}
                  onChange={(value) => {
                    setPolarionProd1Token(value);
                    setPolarionProd1Dirty(true);
                  }}
                />
                <TokenField
                  guide={getTokenGuide("confluence")}
                  username={username}
                  value={confluenceToken}
                  preview={tokenMeta?.confluence_api_token_preview}
                  updatedAt={tokenMeta?.confluence_api_token_updated_at}
                  timeGap={tokenMeta?.confluence_api_token_time_gap}
                  onChange={(value) => {
                    setConfluenceToken(value);
                    setConfluenceDirty(true);
                  }}
                />

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
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save tokens
                    </>
                  )}
                </Button>
              </fieldset>
              {codeAnalyzerAllowed && (
                <>
                  <ScmCredentials />
                  <CopilotCredentialPanel key={username} />
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TokenField({
  guide,
  username,
  value,
  preview,
  updatedAt,
  timeGap,
  onChange,
}: {
  guide: TokenServiceGuide;
  username: string;
  value: string;
  preview?: string | null;
  updatedAt?: string | null;
  timeGap?: string | null;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  const id = `${guide.key}Token`;
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <Label
        htmlFor={id}
        className="text-sm font-medium"
      >
        {guide.label}
      </Label>
      {(preview || hasUpdatedAt(updatedAt)) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {preview && (
            <code className="break-all rounded bg-muted px-1.5 py-0.5 text-foreground">
              {preview}
            </code>
          )}
          {hasUpdatedAt(updatedAt) && (
            <span>
              Updated{" "}
              <time dateTime={updatedAt}>{formatTimestamp(updatedAt)}</time>
              {timeGap && <span> ({timeGap})</span>}
            </span>
          )}
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          className="pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${show ? "Hide" : "Show"} ${guide.label}`}
          aria-controls={id}
          onClick={() => setShow((visible) => !visible)}
          className="absolute inset-y-0 right-0"
        >
          {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      <TokenSetupGuide
        guide={guide}
        username={username}
      />
    </section>
  );
}
