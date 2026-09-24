"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DisclosureSection,
  SectionHeader,
} from "@/app/components/admin/primitives";
import {
  deleteScmServer,
  listAdminScmServers,
  saveScmServer,
  type AdminScmServerView,
  type ScmServerInput,
} from "@/lib/scm";

const EMPTY: ScmServerInput = {
  id: "",
  provider: "gerrit",
  display_name: "",
  endpoint: "",
  auth_profile: "",
  enabled: true,
  validation: {},
};

/** Admin-only named SCM server configuration, separate from personal PAT entry. */
export function ScmServersSection() {
  const [servers, setServers] = useState<AdminScmServerView[]>([]);
  const [draft, setDraft] = useState<ScmServerInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const configurationRef = useRef<HTMLDetailsElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setServers(await listAdminScmServers());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load SCM servers"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveScmServer(draft);
      setDraft(EMPTY);
      await load();
      toast.success("SCM server saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Check the server configuration"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="SCM servers"
        subtitle="Named Gerrit and Plastic sources available for read-only code analysis."
      />
      <DisclosureSection
        title="Server configuration"
        subtitle={`${servers.length} configured · add or update Gerrit and Plastic connections`}
        contentClassName="space-y-3"
        detailsRef={configurationRef}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-primary" /> Add or update server
        </div>
        <fieldset
          className="space-y-3"
          disabled={saving}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(["id", "display_name", "endpoint", "auth_profile"] as const).map(
              (field) => (
                <div
                  key={field}
                  className="space-y-1"
                >
                  <Label
                    htmlFor={`scm-server-${field}`}
                    className="text-xs"
                  >
                    {field.replaceAll("_", " ")}
                  </Label>
                  <Input
                    id={`scm-server-${field}`}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        [field]: event.target.value,
                      }))
                    }
                    placeholder={
                      field === "endpoint" ? "https://scm.example" : undefined
                    }
                  />
                </div>
              )
            )}
            <div className="space-y-1">
              <Label
                htmlFor="scm-server-provider"
                className="text-xs"
              >
                Provider
              </Label>
              <select
                id="scm-server-provider"
                value={draft.provider}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    provider: event.target.value as ScmServerInput["provider"],
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="gerrit">Gerrit</option>
                <option value="plastic">Plastic SCM</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 sm:col-span-2">
              <div>
                <Label htmlFor="scm-server-enabled">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Allow users to connect and start new work with this server.
                </p>
              </div>
              <Switch
                id="scm-server-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) =>
                  setDraft((value) => ({ ...value, enabled }))
                }
              />
            </div>
          </div>
          <Button
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}{" "}
            Save server
          </Button>
        </fieldset>
      </DisclosureSection>
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {server.display_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {server.provider} ·{" "}
                  {server.validation.ready === true ? "ready" : "not ready"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setDraft({
                      id: server.id,
                      provider: server.provider,
                      display_name: server.display_name,
                      endpoint: server.endpoint,
                      auth_profile: server.auth_profile,
                      enabled: server.enabled,
                      validation: server.validation,
                    });
                    if (configurationRef.current) {
                      configurationRef.current.open = true;
                    }
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    void deleteScmServer(server.id)
                      .then(load)
                      .catch((error: unknown) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Failed to disable SCM server"
                        )
                      )
                  }
                  aria-label={`Disable ${server.display_name}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {!servers.length && (
            <p className="text-sm text-muted-foreground">
              No servers configured.
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Readiness is an operator-verified capability state. Local and container
        analysis remain unavailable until their separate worker prerequisites
        pass.
      </p>
    </div>
  );
}
