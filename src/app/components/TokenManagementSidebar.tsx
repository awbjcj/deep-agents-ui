"use client";

import { CredentialTest } from "@/app/components/settings/CredentialTest";
import {
  savedCredentialStatus,
  useCredentialTests,
} from "@/app/hooks/useCredentialTests";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { flushSync } from "react-dom";
import { SettingsContent, SettingsFooter } from "./settings/SettingsLayout";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";
import { SettingsLoading } from "@/app/components/settings/SettingsFeedback";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { MaskedTokenInput } from "@/app/components/settings/MaskedTokenInput";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGetTokens, apiUpdateTokens, UserTokens } from "@/lib/auth";
import { useNotifications } from "@/app/hooks/useNotifications";
import { useAuth } from "@/providers/AuthProvider";
import { canUseCodeAnalyzer } from "@/lib/agent-access";
import {
  hasSavedToken,
  OPEN_TOKEN_WIZARD_EVENT,
  TOKEN_SERVICE_GUIDES,
  type TokenServiceGuide,
  type TokenServiceKey,
} from "@/app/components/tokenServiceGuides";
import { TokenSetupGuide } from "@/app/components/tokenSetupGuides";
import { ScmCredentials } from "@/app/components/ScmCredentials";
import { AsperaCredentials } from "@/app/components/AsperaCredentials";
import { CopilotCredentialPanel } from "@/app/components/CopilotCredentialPanel";
import { Loader2, Save, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** Whether the backend reports a meaningful timestamp for a saved token. */
function hasUpdatedAt(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== "Unknown";
}

interface TokenManagementSidebarProps {
  /** Service key (including the legacy "polarion" alias) to focus on mount. */
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
  // Missing entries are untouched; an explicit empty string clears a token.
  const [tokenDraft, setTokenDraft] = useState<
    Partial<Record<TokenServiceKey, string>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<UserTokens | null>(null);
  const dirty = Object.keys(tokenDraft).length > 0;
  useSettingsDraft(dirty || isSaving);

  const fetchTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(false);
      const tokens = await apiGetTokens();
      // Backend only returns masked previews — never full token values.
      // Token input fields start empty; we only send values the user types.
      setTokenMeta(tokens);
      setTokenDraft({});
    } catch {
      setLoadError(true);
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
    const frame = requestAnimationFrame(() => {
      const trigger = document.getElementById(`${targetId}-edit`);
      if (trigger?.getAttribute("aria-expanded") === "false")
        flushSync(() => trigger.click());
      const el = document.getElementById(targetId) as HTMLInputElement | null;
      if (el) {
        el.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "center",
        });
        el.focus({ preventScroll: true });
      }
      onFocusConsumed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocus, isLoading, onFocusConsumed]);

  const connection = useCredentialTests();

  const handleSave = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const payload: Parameters<typeof apiUpdateTokens>[0] = {};
      for (const guide of TOKEN_SERVICE_GUIDES) {
        const value = tokenDraft[guide.key];
        if (value !== undefined) payload[guide.payloadField] = value;
      }
      const updated = await apiUpdateTokens(payload);
      for (const guide of TOKEN_SERVICE_GUIDES) {
        const secret = payload[guide.payloadField]?.trim();
        if (secret !== undefined) {
          connection.record(
            guide.key,
            { service: guide.payloadField, secret },
            updated.credential_revisions?.[guide.payloadField]
          );
        }
      }
      setTokenMeta(updated);
      applyClearedNotifications(updated.cleared_notifications);
      setTokenDraft({});
      toast.success("Tokens saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update tokens"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const discard = () => {
    for (const guide of TOKEN_SERVICE_GUIDES) connection.clear(guide.key);
    setTokenDraft({});
  };

  const missingCount = TOKEN_SERVICE_GUIDES.filter(
    (guide) => !hasSavedToken(tokenMeta?.[guide.previewField])
  ).length;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Title bar is supplied by parent WorkspacePanel. */}
      <ScrollArea className="h-0 flex-1">
        <SettingsContent>
          {isLoading ? (
            <SettingsLoading />
          ) : loadError ? (
            <div
              role="alert"
              className="border-border space-y-3 rounded-lg border p-4 text-sm"
            >
              <p>
                Could not load your token settings. Your saved credentials have
                not changed.
              </p>
              <Button
                variant="outline"
                onClick={() => void fetchTokens()}
              >
                Retry loading tokens
              </Button>
            </div>
          ) : (
            <>
              <div className="border-border bg-card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-3">
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
                  <span className="text-muted-foreground text-xs">
                    {missingCount}{" "}
                    {missingCount === 1 ? "service needs" : "services need"} a
                    token
                  </span>
                )}
              </div>

              <form
                id="token-settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
                <fieldset
                  disabled={isSaving}
                  className="min-w-0 space-y-5"
                >
                  {TOKEN_SERVICE_GUIDES.map((guide) => (
                    <TokenField
                      key={guide.key}
                      guide={guide}
                      username={username}
                      value={tokenDraft[guide.key] ?? ""}
                      preview={tokenMeta?.[guide.previewField]}
                      updatedAt={
                        tokenMeta?.[`${guide.payloadField}_updated_at`]
                      }
                      timeGap={tokenMeta?.[`${guide.payloadField}_time_gap`]}
                      verificationRevision={
                        tokenMeta?.credential_revisions?.[guide.payloadField]
                      }
                      connection={connection}
                      onChange={(value) => {
                        connection.clear(guide.key);
                        setTokenDraft((draft) => ({
                          ...draft,
                          [guide.key]: value,
                        }));
                      }}
                    />
                  ))}
                </fieldset>
              </form>
              {codeAnalyzerAllowed && (
                <>
                  <ScmCredentials />
                  <CopilotCredentialPanel key={username} />
                </>
              )}
            </>
          )}
          {user && <AsperaCredentials key={user.user_id} />}
        </SettingsContent>
      </ScrollArea>
      {!isLoading && !loadError && (
        <SettingsFooter>
          <p
            role="status"
            className="text-muted-foreground m-0 text-xs"
          >
            {isSaving
              ? "Saving tokens…"
              : dirty
                ? "Unsaved token changes"
                : "Only edited tokens are saved."}
          </p>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                type="button"
                variant="outline"
                onClick={discard}
                disabled={isSaving}
                className="min-h-touch"
              >
                Discard
              </Button>
            )}
            <Button
              type="submit"
              form="token-settings-form"
              disabled={isSaving || !dirty}
              className="min-h-touch flex-1"
            >
              {isSaving ? (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Save
                  className="size-4"
                  aria-hidden="true"
                />
              )}
              {isSaving ? "Saving…" : "Save tokens"}
            </Button>
          </div>
        </SettingsFooter>
      )}
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
  verificationRevision,
  connection,
  onChange,
}: {
  guide: TokenServiceGuide;
  username: string;
  value: string;
  preview?: string | null;
  updatedAt?: string | null;
  timeGap?: string | null;
  verificationRevision?: string;
  connection: ReturnType<typeof useCredentialTests>;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  const id = `${guide.key}Token`;
  const saved = hasSavedToken(preview);
  return (
    <SavedSetting
      revision={updatedAt}
      title={guide.label}
      triggerId={`${id}-edit`}
      status={
        saved
          ? savedCredentialStatus(guide.key, verificationRevision)
          : undefined
      }
    >
      <section className="space-y-2">
        <Label
          htmlFor={id}
          className={saved ? "sr-only" : "text-sm font-medium"}
        >
          {guide.label}
        </Label>
        {saved && (
          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 break-all">
              {preview}
            </code>
            {hasUpdatedAt(updatedAt) && (
              <span>
                Updated{" "}
                <time dateTime={updatedAt}>{formatTimestamp(updatedAt)}</time>
                {timeGap && <span> ({timeGap})</span>}
              </span>
            )}
          </div>
        )}
        <MaskedTokenInput
          id={id}
          tokenLabel={guide.label}
          revealed={show}
          onToggle={() => setShow((visible) => !visible)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={saved ? "Enter a replacement token" : "Paste a token"}
        />
        {value.trim() && (
          <CredentialTest
            result={connection.results[guide.key]}
            disabled={false}
            onTest={() =>
              void connection.test(guide.key, {
                service: guide.payloadField,
                secret: value.trim(),
              })
            }
          />
        )}
        <TokenSetupGuide
          guide={guide}
          username={username}
        />
      </section>
    </SavedSetting>
  );
}
