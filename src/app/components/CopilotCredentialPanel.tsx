"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Github,
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
  githubHostSchema,
  saveCopilotCredential,
  type CopilotCredentialStatus,
  type CopilotQuotaStatus,
} from "@/lib/code-analysis";

/** Personal Copilot access, kept separate from shared integration tokens. */
export function CopilotCredentialPanel() {
  const [status, setStatus] = useState<CopilotCredentialStatus | null>(null);
  const [token, setToken] = useState("");
  const [githubHost, setGithubHost] = useState("github.com");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quota, setQuota] = useState<CopilotQuotaStatus | null>(null);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaError, setQuotaError] = useState("");
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
        setError("Use github.com or your exact company.ghe.com hostname.");
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
  const configured = quotaAvailable;
  return (
    <section
      aria-labelledby="copilot-credential-title"
      className="space-y-4 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="-mx-4 -mt-4 flex items-start gap-3 border-b border-border/70 bg-muted/20 px-4 py-3.5">
        <span className="border-primary/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
          <Github
            aria-hidden="true"
            className="h-4 w-4"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="copilot-credential-title"
              className="text-sm font-semibold tracking-tight"
            >
              Copilot analysis
            </h3>
            <p
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                configured
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : expired
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-background/70 text-muted-foreground"
              }`}
              role="status"
            >
              {configured ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="h-3 w-3"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-current"
                />
              )}
              {busy && !status
                ? "Loading token status…"
                : !status
                ? "Token status unavailable"
                : expired
                ? "Token expired"
                : status.configured
                ? "Personal token configured"
                : "No personal token configured"}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Connect your GitHub account for optional Copilot-powered code
            analysis.
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {COPILOT_USAGE_EXPLANATION}
      </p>
      <CopilotQuotaMeter
        quota={quotaAvailable ? quota : null}
        available={quotaAvailable}
        loading={quotaBusy}
        error={quotaError}
        onRefresh={() => void refreshQuota()}
      />
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <KeyRound
          aria-hidden="true"
          className="h-3.5 w-3.5 text-primary"
        />
        Account credential
      </div>
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
            onChange={(event) => setGithubHost(event.target.value)}
            aria-describedby="copilot-host-help"
          />
          <p
            id="copilot-host-help"
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            Use github.com or your exact company.ghe.com hostname.
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
            onChange={(event) => setToken(event.target.value)}
            aria-describedby="copilot-token-help"
          />
          <p
            id="copilot-token-help"
            className="text-[11px] leading-relaxed text-muted-foreground"
          >
            Enter a fine-grained token with the Copilot Requests account
            permission and a Copilot license. Saved tokens are never shown.
            Replacing or removing a token requests cancellation of analyses
            using it; a request already sent to GitHub may finish.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="copilot-expiry">Expiry (optional, local time)</Label>
          <Input
            id="copilot-expiry"
            type="datetime-local"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
          {status?.expires_at && (
            <p className="text-xs text-muted-foreground">
              Current expiry: {new Date(status.expires_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button
            type="button"
            size="sm"
            disabled={!token || busy}
            onClick={() => void update(false)}
            className="transition-[background-color,box-shadow,transform] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
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
            size="sm"
            variant="outline"
            disabled={!status?.configured || busy}
            onClick={() => void update(true)}
            className="text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2
              aria-hidden="true"
              className="h-3.5 w-3.5"
            />
            Remove token
          </Button>
        </div>
      </fieldset>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
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
        <div className="border-primary/20 flex items-start gap-2 rounded-md border bg-primary/5 px-3 py-2 text-xs text-foreground">
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
          />
          <p
            role="status"
            className="leading-relaxed"
          >
            {notice}
          </p>
        </div>
      )}
    </section>
  );
}
