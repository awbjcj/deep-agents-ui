"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  credentialUpdate,
  deleteScmCredential,
  listScmServers,
  saveScmCredential,
  scmFieldKey,
  type ScmServerView,
} from "@/lib/scm";

/** Dynamic personal SCM credentials; configured server names never become static UI fields. */
export function ScmCredentials() {
  const [servers, setServers] = useState<ScmServerView[]>([]);
  const [values, setValues] = useState<
    Record<string, { token: string; username: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setServers(await listScmServers(signal));
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
    setValues((current) => {
      const previous = current[serverId] ?? { token: "", username: "" };
      return { ...current, [serverId]: { ...previous, [field]: value } };
    });
  };

  const save = async (serverId: string) => {
    const value = values[serverId] ?? { token: "", username: "" };
    try {
      credentialUpdate(value.token, value.username);
      setSaving(serverId);
      await saveScmCredential(serverId, value);
      // Clear only the successfully sent secret; values for every other
      // server remain untouched so a partial save cannot erase user input.
      setValues((current) => ({
        ...current,
        [serverId]: { token: "", username: "" },
      }));
      await load();
      toast.success("SCM credential saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save SCM credential"
      );
    } finally {
      setSaving(null);
    }
  };

  const remove = async (serverId: string) => {
    setSaving(serverId);
    try {
      await deleteScmCredential(serverId);
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
      setSaving(null);
    }
  };

  return (
    <section
      className="space-y-3"
      aria-labelledby="scm-credentials-title"
    >
      <div className="flex items-start gap-2">
        <KeyRound
          className="mt-0.5 h-4 w-4 text-primary"
          aria-hidden="true"
        />
        <div>
          <h3
            id="scm-credentials-title"
            className="text-sm font-semibold"
          >
            Source-control access
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Add a personal access token only for the configured servers you use.
            Tokens are encrypted and never shown again.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No SCM servers are available yet. Ask an administrator to configure
          one.
        </p>
      ) : (
        servers.map((server) => {
          const value = values[server.id] ?? { token: "", username: "" };
          const busy = saving === server.id;
          const fieldKey = scmFieldKey(server.id);
          return (
            <div
              key={server.id}
              className="space-y-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{server.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {server.provider === "gerrit" ? "Gerrit" : "Plastic SCM"} ·{" "}
                    {server.credential_state ?? "missing"}
                  </p>
                </div>
                {server.credential_state !== "missing" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(server.id)}
                    disabled={busy}
                    aria-label={`Remove ${server.display_name} credential`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
                    autoComplete="off"
                    value={value.token}
                    disabled={busy}
                    onChange={(event) =>
                      setValue(server.id, "token", event.target.value)
                    }
                    placeholder="Paste a new token"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${fieldKey}:username`}
                    className="text-xs"
                  >
                    Login name (if required)
                  </Label>
                  <Input
                    id={`${fieldKey}:username`}
                    autoComplete="username"
                    value={value.username}
                    disabled={busy}
                    onChange={(event) =>
                      setValue(server.id, "username", event.target.value)
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => void save(server.id)}
                disabled={busy || !value.token.trim()}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save credential
              </Button>
            </div>
          );
        })
      )}
    </section>
  );
}
