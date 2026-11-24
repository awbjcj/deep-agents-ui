"use client";

import { CredentialTest } from "@/app/components/settings/CredentialTest";
import {
  savedCredentialStatus,
  useCredentialTests,
} from "@/app/hooks/useCredentialTests";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
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
  const [pending, setPending] = useState<{
    serverId: string;
    action: "save" | "remove";
  } | null>(null);
  useSettingsDraft(
    pending !== null ||
      Object.values(values).some((value) => !!value.token || !!value.username)
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await listScmServers(signal);
      setServers(next);
      return next;
    } catch (error) {
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        toast.error(
          error instanceof Error ? error.message : "Failed to load SCM servers"
        );
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
      const next = (await load())?.find((item) => item.id === serverId);
      connection.record(
        `scm:${serverId}`,
        {
          service: "scm",
          server_id: serverId,
          secret: value.token.trim(),
          username: value.username.trim(),
        },
        next?.generation === server.generation &&
          next.credential_generation === saved.credential_generation
          ? next.credential_revision
          : null
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
      await load();
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
    <section
      className="space-y-3"
      aria-labelledby="scm-credentials-title"
    >
      <div className="flex items-start gap-2">
        <KeyRound
          className="text-primary mt-0.5 h-4 w-4"
          aria-hidden="true"
        />
        <div>
          <h3
            id="scm-credentials-title"
            className="text-sm font-semibold"
          >
            Source-control access
          </h3>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Stored tokens are encrypted.
          </p>
        </div>
      </div>

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
          const savedStatus = configured
            ? savedCredentialStatus(
                `scm:${server.id}`,
                reconnect ? null : server.credential_revision,
                server.credential_state === "validated"
              )
            : undefined;
          return (
            <SavedSetting
              key={server.id}
              revision={revisions[server.id]}
              title={server.display_name}
              status={savedStatus}
            >
              <form
                autoComplete="off"
                className="border-border bg-card space-y-2 rounded-lg border p-3"
                aria-labelledby={`${fieldKey}:title`}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy && value.token.trim()) void save(server);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 wrap-anywhere">
                    <p
                      id={`${fieldKey}:title`}
                      className={
                        savedStatus ? "sr-only" : "text-sm font-medium"
                      }
                    >
                      {server.display_name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {server.display_name !== providerName && providerName}
                    </p>
                    {reconnect && (
                      <p className="text-muted-foreground text-xs">
                        The server connection changed. Enter your credential
                        again.
                      </p>
                    )}
                  </div>
                  {server.credential_state !== undefined &&
                    server.credential_state !== "missing" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-touch"
                        onClick={() => void remove(server.id)}
                        disabled={busy}
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
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
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
                      className="min-h-touch text-base sm:text-sm"
                      value={value.token}
                      disabled={busy}
                      required
                      onChange={(event) =>
                        setValue(server.id, "token", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`${fieldKey}:username`}
                      className="text-xs"
                    >
                      {needsUsername
                        ? `${providerName} login name (required)`
                        : "Login name (if required)"}
                    </Label>
                    <Input
                      id={`${fieldKey}:username`}
                      autoComplete="off"
                      className="min-h-touch text-base sm:text-sm"
                      value={value.username}
                      disabled={busy}
                      required={needsUsername}
                      onChange={(event) =>
                        setValue(server.id, "username", event.target.value)
                      }
                    />
                  </div>
                </div>
                {value.token.trim() && (
                  <CredentialTest
                    result={connection.results[`scm:${server.id}`]}
                    disabled={busy || (needsUsername && !value.username.trim())}
                    onTest={() =>
                      void connection.test(`scm:${server.id}`, {
                        service: "scm",
                        server_id: server.id,
                        secret: value.token.trim(),
                        username: value.username.trim(),
                      })
                    }
                  />
                )}
                <Button
                  type="submit"
                  className="min-h-touch"
                  disabled={busy || !value.token.trim()}
                >
                  {saving ? (
                    <Loader2
                      className="motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  {saving ? "Saving credential…" : "Save credential"}
                </Button>
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
    </section>
  );
}
