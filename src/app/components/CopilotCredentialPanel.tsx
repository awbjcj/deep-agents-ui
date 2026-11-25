"use client";

import { CredentialSection } from "@/app/components/settings/CredentialSection";
import { DESTRUCTIVE_OUTLINE } from "@/app/components/settings/credentialStyles";
import { CredentialTest } from "@/app/components/settings/CredentialTest";
import {
  credentialStatusLabels,
  savedCredentialStatus,
  useCredentialTests,
} from "@/app/hooks/useCredentialTests";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  GitFork,
  KeyRound,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { CopilotQuotaMeter } from "@/app/components/CopilotQuotaMeter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COPILOT_USAGE_EXPLANATION,
  deleteCopilotCredential,
  getCopilotCredential,
  getCopilotQuota,
  DEFAULT_GITHUB_HOST,
  githubHostSchema,
  saveCopilotCredential,
  type CopilotCredentialStatus,
  type CopilotQuotaStatus,
} from "@/lib/code-analysis";

/** Personal Copilot access, kept separate from shared integration tokens. */
export function CopilotCredentialPanel() {
  const [status, setStatus] = useState<CopilotCredentialStatus | null>(null);
  const [token, setToken] = useState("");
  const [githubHost, setGithubHost] = useState(DEFAULT_GITHUB_HOST);
  const [expiry, setExpiry] = useState("");
  const connection = useCredentialTests();
  const draft = {
    service: "copilot" as const,
    secret: token,
    github_host: githubHost.trim().toLowerCase(),
  };
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quota, setQuota] = useState<CopilotQuotaStatus | null>(null);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaError, setQuotaError] = useState("");
  useSettingsDraft(
    !!token ||
      !!expiry ||
      (status !== null && githubHost !== status.github_host)
  );
  const quotaRequest = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });

  const cancelQuotaRequest = useCallback(() => {
    quotaRequest.current.id += 1;
    quotaRequest.current.controller?.abort();
    quotaRequest.current.controller = null;
  }, []);

  const refreshQuota = useCallback(async () => {
    const id = quotaRequest.current.id + 1;
    quotaRequest.current.controller?.abort();
    const controller = new AbortController();
    quotaRequest.current = { id, controller };
    setQuotaBusy(true);
    setQuotaError("");
    try {
      const nextQuota = await getCopilotQuota(controller.signal);
      if (quotaRequest.current.id === id && !controller.signal.aborted)
        setQuota(nextQuota);
    } catch {
      if (quotaRequest.current.id === id && !controller.signal.aborted)
        setQuotaError(
          "Could not verify quota. Copilot analysis stays unavailable until this check succeeds."
        );
    } finally {
      if (quotaRequest.current.id === id) {
        quotaRequest.current.controller = null;
        setQuotaBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCopilotCredential()
      .then((value) => {
        if (!active) return;
        setStatus(value);
        setGithubHost(value.github_host);
        if (
          value.configured &&
          (!value.expires_at ||
            new Date(value.expires_at).getTime() > Date.now())
        )
          void refreshQuota();
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load Copilot token status. Reopen Token settings to retry."
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      cancelQuotaRequest();
    };
  }, [cancelQuotaRequest, refreshQuota]);

  async function update(remove: boolean) {
    setError("");
    setNotice("");
    let expiresAt: string | null = null;
    if (!remove) {
      if (!githubHostSchema.safeParse(githubHost).success) {
        setError("Use your exact company.ghe.com hostname.");
        return;
      }
      if (
        !/^github_pat_\S+$/.test(token) ||
        new TextEncoder().encode(token).length > 8192
      ) {
        setError("Enter a fine-grained GitHub personal access token.");
        return;
      }
      if (expiry) {
        const parsed = new Date(expiry);
        if (
          !Number.isFinite(parsed.getTime()) ||
          parsed.getTime() <= Date.now()
        ) {
          setError("Choose an expiry time in the future.");
          return;
        }
        expiresAt = parsed.toISOString();
      }
    }
    cancelQuotaRequest();
    setQuotaBusy(false);
    setQuota(null);
    setQuotaError("");
    setBusy(true);
    try {
      const nextStatus = await (remove
        ? deleteCopilotCredential()
        : saveCopilotCredential({
            token,
            expires_at: expiresAt,
            github_host: githubHostSchema.parse(githubHost),
          }));
      connection.record(
        "copilot",
        remove ? null : draft,
        nextStatus.updated_at
      );
      setStatus(nextStatus);
      setToken("");
      setExpiry("");
      setNotice(remove ? "Copilot token removed." : "Copilot token saved.");
      const nextExpired =
        nextStatus.expires_at &&
        new Date(nextStatus.expires_at).getTime() <= Date.now();
      if (!remove && nextStatus.configured && !nextExpired) void refreshQuota();
    } catch {
      setError(
        remove
          ? "Could not remove the Copilot token. Try again."
          : "Could not save Copilot token settings. Check your token and expiry, then try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const expired =
    status?.expires_at && new Date(status.expires_at).getTime() <= Date.now();
  const quotaAvailable = Boolean(status?.configured && !expired);
  const configured = Boolean(status?.configured);
  const savedStatus = configured
    ? savedCredentialStatus("copilot", status?.updated_at)
    : undefined;
  const testSaved = Boolean(
    configured &&
    !expired &&
    !token &&
    draft.github_host === status?.github_host &&
    !expiry
  );
  return (
    <CredentialSection
      id="copilot-credential-title"
      title="Copilot analysis"
      description={COPILOT_USAGE_EXPLANATION}
      icon={GitFork}
    >
      {!configured && busy && !status && (
        <p
          role="status"
          className="text-muted-foreground text-xs"
        >
          Loading token status…
        </p>
      )}
      <CopilotQuotaMeter
        quota={quotaAvailable ? quota : null}
        available={quotaAvailable}
        loading={quotaBusy}
        error={quotaError}
        onRefresh={() => void refreshQuota()}
      />
      <SavedSetting
        revision={status?.updated_at}
        title="Copilot credential"
        status={savedStatus}
        missingStatus={status ? credentialStatusLabels.missing : undefined}
        updatedAt={configured ? status?.updated_at : undefined}
        expiresAt={configured ? status?.expires_at : undefined}
      >
        <fieldset
          disabled={busy || !status}
          className="space-y-3 disabled:opacity-70"
        >
          <div className="space-y-1.5">
            <Label htmlFor="copilot-host">GitHub account hostname</Label>
            <Input
              id="copilot-host"
              value={githubHost}
              maxLength={253}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                connection.clear("copilot");
                setGithubHost(event.target.value);
              }}
              aria-describedby="copilot-host-help"
            />
            <p
              id="copilot-host-help"
              className="text-muted-foreground text-xs leading-relaxed"
            >
              Use your exact company.ghe.com hostname.
              {status?.configured && ` Saved account: ${status.github_host}.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilotToken">
              Fine-grained personal access token
            </Label>
            <Input
              id="copilotToken"
              type="password"
              autoComplete="new-password"
              value={token}
              maxLength={8192}
              onChange={(event) => {
                connection.clear("copilot");
                setToken(event.target.value);
              }}
              aria-describedby="copilot-token-help"
            />
            <p
              id="copilot-token-help"
              className="text-muted-foreground text-xs leading-relaxed"
            >
              Enter a fine-grained token with the Copilot Requests account
              permission and a Copilot license. Saved tokens are never shown.
              Replacing or removing a token requests cancellation of analyses
              using it; a request already sent to GitHub may finish.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-expiry">
              Expiry (optional, local time)
            </Label>
            <Input
              id="copilot-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </div>
          {(testSaved || token) && (
            <CredentialTest
              result={connection.results.copilot}
              disabled={busy || !githubHostSchema.safeParse(githubHost).success}
              saved={testSaved}
              savedStatus={
                testSaved && savedStatus === "Verified" ? "verified" : undefined
              }
              onTest={() => {
                if (testSaved)
                  void connection.testSaved(
                    "copilot",
                    { service: "copilot" },
                    status?.updated_at
                  );
                else void connection.test("copilot", draft);
              }}
            />
          )}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              disabled={!token || busy || connection.isTesting}
              onClick={() => void update(false)}
              className="min-h-touch"
            >
              {busy ? (
                <Loader2
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <KeyRound
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                />
              )}
              {busy ? "Saving…" : "Save token"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!status?.configured || busy || connection.isTesting}
              onClick={() => void update(true)}
              className={DESTRUCTIVE_OUTLINE}
            >
              <Trash2
                aria-hidden="true"
                className="h-3.5 w-3.5"
              />
              Remove token
            </Button>
          </div>
        </fieldset>
      </SavedSetting>
      {error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <p
            role="alert"
            className="leading-relaxed"
          >
            {error}
          </p>
        </div>
      )}
      {notice && (
        <div className="border-primary/20 bg-primary/5 text-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <CheckCircle2
            aria-hidden="true"
            className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <p
            role="status"
            className="leading-relaxed"
          >
            {notice}
          </p>
        </div>
      )}
    </CredentialSection>
  );
}
