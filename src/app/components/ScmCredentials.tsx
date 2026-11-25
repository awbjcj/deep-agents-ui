"use client";

import { CredentialSection } from "@/app/components/settings/CredentialSection";
import { CredentialTest } from "@/app/components/settings/CredentialTest";
import {
  savedCredentialStatus,
  useCredentialTests,
} from "@/app/hooks/useCredentialTests";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteScmCredential,
  listScmServers,
  saveScmCredential,
  scmFieldKey,
  scmProviderLabels,
  scmRequiresUsername,
  type ScmServerView,
} from "@/lib/scm";

/** Dynamic personal SCM credentials; configured server names never become static UI fields. */
export function ScmCredentials() {
  const [servers, setServers] = useState<ScmServerView[]>([]);
  const [values, setValues] = useState<
    Record<string, { token: string; username: string }>
  >({});
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const connection = useCredentialTests();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<{
    serverId: string;
    action: "save" | "remove";
  } | null>(null);
  useSettingsDraft(
    pending !== null ||
      Object.values(values).some((value) => !!value.token || !!value.username)
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const next = await listScmServers(signal);
      if (!signal?.aborted) setServers(next);
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        if (!signal?.aborted) setLoadError(true);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const setValue = (
    serverId: string,
    field: "token" | "username",
    value: string
  ) => {
    connection.clear(`scm:${serverId}`);
    setValues((current) => {
      const previous = current[serverId] ?? { token: "", username: "" };
      return { ...current, [serverId]: { ...previous, [field]: value } };
    });
  };

  const save = async (server: ScmServerView) => {
    const serverId = server.id;
    const value = values[serverId] ?? { token: "", username: "" };
    try {
      setPending({ serverId, action: "save" });
      const saved = await saveScmCredential(serverId, value, server.provider);
      // Clear the submitted fields and preserve drafts for other servers.
      setValues((current) => ({
        ...current,
        [serverId]: { token: "", username: "" },
      }));
      setRevisions((current) => ({
        ...current,
        [serverId]: (current[serverId] ?? 0) + 1,
      }));
      const serverChanged =
        saved.server_generation !== undefined &&
        saved.server_generation !== server.generation;
      connection.record(
        `scm:${serverId}`,
        {
          service: "scm",
          server_id: serverId,
          secret: value.token.trim(),
          username: value.username.trim(),
        },
        serverChanged ? null : saved.credential_revision
      );
      setServers((current) =>
        current.map((item) =>
          item.id === serverId
            ? {
                ...item,
                generation: saved.server_generation ?? item.generation,
                credential_state: saved.validation_state,
                credential_generation: saved.credential_generation,
                credential_revision: saved.credential_revision,
                credential_updated_at: saved.credential_updated_at,
                credential_expires_at: saved.credential_expires_at,
              }
            : item
        )
      );
      toast.success("SCM credential saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save SCM credential"
      );
    } finally {
      setPending(null);
    }
  };

  const remove = async (serverId: string) => {
    setPending({ serverId, action: "remove" });
    try {
      await deleteScmCredential(serverId);
      connection.record(`scm:${serverId}`, null);
      setValues((current) => ({
        ...current,
        [serverId]: { token: "", username: "" },
      }));
      setServers((current) =>
        current.map((item) =>
          item.id === serverId
            ? {
                ...item,
                credential_state: "missing",
                credential_generation: null,
                credential_revision: null,
                credential_updated_at: null,
                credential_expires_at: null,
              }
            : item
        )
      );
      toast.success("SCM credential removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove SCM credential"
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <CredentialSection
      id="scm-credentials-title"
      title="Source-control access"
      description="Connect the accounts you use to read repositories in Code Analyzer."
      icon={GitBranch}
    >
      {loading ? (
        <div
          role="status"
          className="text-muted-foreground flex items-center gap-2 py-3 text-sm"
        >
          <Loader2
            className="size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
          Loading source servers…
        </div>
      ) : loadError ? (
        <div className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <p
            role="alert"
            className="text-sm"
          >
            Could not load source-control servers.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-touch"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      ) : servers.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          No SCM servers are available yet. Ask an administrator to configure
          one.
        </p>
      ) : (
        servers.map((server) => {
          const value = values[server.id] ?? { token: "", username: "" };
          const busy = pending !== null;
          const saving =
            pending?.serverId === server.id && pending.action === "save";
          const removing =
            pending?.serverId === server.id && pending.action === "remove";
          const fieldKey = scmFieldKey(server.id);
          const providerName = scmProviderLabels[server.provider];
          const needsUsername = scmRequiresUsername(server.provider);
          const reconnect = server.credential_state === "reconnect_required";
          const configured =
            !!server.credential_state && server.credential_state !== "missing";
          const draft = Boolean(value.token.trim() || value.username.trim());
          const canSave =
            Boolean(value.token.trim()) &&
            (!needsUsername || Boolean(value.username.trim()));
          const testSaved = configured && !reconnect && !draft;
          const result = connection.results[fieldKey];
          const canTest =
            server.provider !== "plastic" && (canSave || testSaved);
          const savedStatus = configured
            ? savedCredentialStatus(
                fieldKey,
                reconnect ? null : server.credential_revision,
                server.credential_state === "validated"
              )
            : undefined;
          return (
            <SavedSetting
              key={server.id}
              revision={revisions[server.id]}
              title={server.display_name}
              status={savedStatus ?? "Not set"}
              updatedAt={server.credential_updated_at}
              expiresAt={server.credential_expires_at}
              icon={
                <GitBranch
                  aria-hidden="true"
                  className="text-primary size-4 shrink-0"
                />
              }
              metadata={
                server.display_name !== providerName && (
                  <span className="text-muted-foreground block text-xs font-normal">
                    {providerName}
                  </span>
                )
              }
            >
              <form
                autoComplete="off"
                className="border-border space-y-3 border-t pt-3"
                aria-labelledby={`${fieldKey}:title`}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy && canSave && result?.status !== "testing")
                    void save(server);
                }}
              >
                <h4
                  id={`${fieldKey}:title`}
                  className="sr-only"
                >
                  {server.display_name}
                </h4>
                {reconnect && (
                  <p className="text-muted-foreground text-xs">
                    The server connection changed. Replace the credential to
                    reconnect.
                  </p>
                )}
                {server.provider === "plastic" && (
                  <p className="text-muted-foreground text-xs">
                    Use Code Analyzer with a repository to test Plastic SCM
                    access.
                  </p>
                )}
                <div className="grid gap-3 @sm/tokens:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor={`${fieldKey}:username`}
                      className="text-xs"
                    >
                      Login name{!needsUsername && " (optional)"}
                    </Label>
                    <Input
                      id={`${fieldKey}:username`}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="min-h-touch text-base"
                      value={value.username}
                      disabled={busy}
                      required={needsUsername}
                      onChange={(event) =>
                        setValue(server.id, "username", event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor={`${fieldKey}:token`}
                      className="text-xs"
                    >
                      Personal access token
                    </Label>
                    <Input
                      id={`${fieldKey}:token`}
                      type="password"
                      autoComplete="new-password"
                      className="min-h-touch text-base"
                      value={value.token}
                      placeholder={
                        configured ? "Enter a replacement token" : undefined
                      }
                      disabled={busy}
                      required
                      onChange={(event) =>
                        setValue(server.id, "token", event.target.value)
                      }
                    />
                  </div>
                </div>
                <CredentialTest
                  result={result}
                  disabled={busy || !canTest}
                  showTest={server.provider !== "plastic"}
                  saved={testSaved}
                  savedStatus={
                    testSaved && savedStatus === "Verified"
                      ? "verified"
                      : undefined
                  }
                  onTest={() => {
                    const target = {
                      service: "scm" as const,
                      server_id: server.id,
                    };
                    if (testSaved) {
                      void connection.testSaved(
                        fieldKey,
                        target,
                        server.credential_revision
                      );
                    } else {
                      void connection.test(fieldKey, {
                        ...target,
                        secret: value.token.trim(),
                        username: value.username.trim(),
                      });
                    }
                  }}
                  actions={
                    <>
                      <Button
                        type="submit"
                        className="min-h-touch"
                        disabled={
                          busy || !canSave || result?.status === "testing"
                        }
                      >
                        {saving ? (
                          <Loader2
                            className="motion-safe:animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save aria-hidden="true" />
                        )}
                        {saving ? "Saving…" : "Save credential"}
                      </Button>
                      {configured && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="size-touch"
                          onClick={() => void remove(server.id)}
                          disabled={busy || result?.status === "testing"}
                          aria-label={`Remove ${server.display_name} credential`}
                        >
                          {removing ? (
                            <Loader2
                              className="motion-safe:animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2
                              className="text-destructive"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      )}
                    </>
                  }
                />
                <span
                  role="status"
                  className="sr-only"
                >
                  {saving && "Saving credential…"}
                  {removing && "Removing credential…"}
                </span>
              </form>
            </SavedSetting>
          );
        })
      )}
    </CredentialSection>
  );
}
