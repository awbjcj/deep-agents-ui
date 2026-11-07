"use client";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Save, Server, Trash2 } from "lucide-react";
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
  partitionScmServers,
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
  // ID of the server being edited; the ID is its stable identity, so editing
  // must update that record rather than create a second one under a new ID.
  const [editingId, setEditingId] = useState<string | null>(null);
  const configurationRef = useRef<HTMLDetailsElement>(null);
  const originalDraft = editingId
    ? servers.find((server) => server.id === editingId)
    : null;
  const baseline = originalDraft ?? EMPTY;
  useSettingsDraft(
    saving ||
      Object.keys(EMPTY).some(
        (key) =>
          JSON.stringify(draft[key as keyof ScmServerInput]) !==
          JSON.stringify(baseline[key as keyof ScmServerInput])
      )
  );

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
    const original = editingId
      ? servers.find((server) => server.id === editingId)
      : undefined;
    const input = editingId ? { ...draft, id: editingId } : draft;
    if (!editingId && servers.some((server) => server.id === input.id.trim())) {
      toast.error(
        `A server with ID "${input.id.trim()}" already exists. Use Edit or Restore instead.`
      );
      return;
    }
    setSaving(true);
    try {
      await saveScmServer(input);
      setDraft(EMPTY);
      setEditingId(null);
      await load();
      const reconnect =
        original !== undefined &&
        (original.provider !== input.provider ||
          original.endpoint !== input.endpoint ||
          original.auth_profile !== input.auth_profile);
      toast.success(
        reconnect
          ? "SCM server saved. Users must save their token again for the changed connection."
          : "SCM server saved"
      );
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

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const toInput = (server: AdminScmServerView): ScmServerInput => ({
    id: server.id,
    provider: server.provider,
    display_name: server.display_name,
    endpoint: server.endpoint,
    auth_profile: server.auth_profile,
    enabled: server.enabled,
    validation: server.validation,
  });

  const disable = async (server: AdminScmServerView) => {
    setSaving(true);
    try {
      await deleteScmServer(server.id);
      if (editingId === server.id) cancelEdit();
      await load();
      toast.success(
        `${server.display_name} disabled. Users can no longer use it; restore it under Disabled servers.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to disable SCM server"
      );
    } finally {
      setSaving(false);
    }
  };

  const restore = async (server: AdminScmServerView) => {
    setSaving(true);
    try {
      await saveScmServer({ ...toInput(server), enabled: true });
      await load();
      toast.success(
        `${server.display_name} restored. Users must save their token again.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore SCM server"
      );
    } finally {
      setSaving(false);
    }
  };

  const { active, disabled } = partitionScmServers(servers);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="SCM servers"
        subtitle="Named Gerrit and Plastic sources available for read-only code analysis."
      />
      <DisclosureSection
        title="Server configuration"
        subtitle={`${active.length} enabled · ${disabled.length} disabled`}
        contentClassName="space-y-3"
        detailsRef={configurationRef}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-primary" />{" "}
          {editingId ? `Edit server ${editingId}` : "Add server"}
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
                    readOnly={field === "id" && editingId !== null}
                    aria-readonly={field === "id" && editingId !== null}
                    title={
                      field === "id" && editingId !== null
                        ? "The ID is the server's permanent identity and cannot be changed"
                        : undefined
                    }
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        [field]: event.target.value,
                      }))
                    }
                    placeholder={
                      field === "endpoint"
                        ? "https://scm.example"
                        : field === "auth_profile"
                        ? "http_token"
                        : undefined
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
          <div className="flex gap-2">
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
            {editingId !== null && (
              <Button
                variant="outline"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </fieldset>
      </DisclosureSection>
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {server.display_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {server.id} · {server.provider} · enabled
                  {server.validation.ready === true && " · operator-verified"}
                  {editingId === server.id && " · editing"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(server.id);
                    setDraft(toInput(server));
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
                  onClick={() => void disable(server)}
                  aria-label={`Disable ${server.display_name}`}
                  title="Disable (keeps report history)"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {!active.length && (
            <p className="text-sm text-muted-foreground">No enabled servers.</p>
          )}
          {disabled.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Disabled servers
              </p>
              {disabled.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 opacity-80"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {server.display_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {server.id} · {server.provider} · disabled · hidden from
                      users
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void restore(server)}
                    aria-label={`Restore ${server.display_name}`}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Disabling hides a server from users and stops new work, but keeps its ID
        so existing reports stay traceable. Each user validates their own token
        through the Code Analyzer. Local and container analysis remain
        unavailable until their separate worker prerequisites pass.
      </p>
    </div>
  );
}
