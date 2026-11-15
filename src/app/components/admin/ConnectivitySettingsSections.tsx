"use client";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  Database,
  Layers,
  Loader2,
  Paperclip,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type AdminConnectivityResponse,
  type AdminConnectivityUpdatePayload,
  apiGetAdminConnectivity,
  apiSetAdminConnectivity,
  type EmbeddingProvider,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  ConnectivityLoadingState,
  ConnectivityLoadError,
} from "@/components/connectivity/ConnectivityLoadState";
import { ConnectivityTokenField } from "@/app/components/admin/ConnectivityTokenField";
import { ProviderEndpointFields } from "@/app/components/admin/ProviderEndpointFields";
import { ENDPOINT_PROVIDERS } from "@/components/connectivity/modes";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import {
  DisclosureSection,
  SectionHeader,
} from "@/app/components/admin/primitives";

function useAdminConnectivity(errorMessage: string) {
  const [connectivity, setConnectivity] =
    useState<AdminConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    apiGetAdminConnectivity()
      .then((data) => {
        if (current) setConnectivity(data);
      })
      .catch(() => {
        if (current) setError(errorMessage);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [errorMessage, loadAttempt]);

  return {
    connectivity,
    setConnectivity,
    loading,
    error,
    retry: () => setLoadAttempt((attempt) => attempt + 1),
  };
}

/** Document-vector provider selection for the Search destination. */
export function EmbeddingProviderSection() {
  const { connectivity, setConnectivity, loading, error, retry } =
    useAdminConnectivity("Failed to load embedding settings");
  const [saving, setSaving] = useState(false);

  const selectProvider = async (provider: EmbeddingProvider) => {
    if (!connectivity || provider === connectivity.embedding_provider) return;
    setSaving(true);
    try {
      const updated = await apiSetAdminConnectivity({
        embedding_provider: provider,
      });
      setConnectivity(updated);
      toast.success(
        provider === "copilot"
          ? "Embeddings now use copilot-api"
          : "Embeddings now use the native API"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update embedding provider"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Document embeddings"
        subtitle="API used by library ingestion and semantic retrieval"
      />
      {loading ? (
        <ConnectivityLoadingState />
      ) : error ? (
        <ConnectivityLoadError
          message={error}
          onRetry={retry}
        />
      ) : connectivity ? (
        <div className="aptiv-glass-soft overflow-hidden rounded-lg shadow-sm">
          <div
            className="grid grid-cols-2 gap-2 p-3"
            aria-label="Embedding API"
          >
            {(
              [
                {
                  id: "native",
                  label: "Native API",
                  detail: "Existing OpenAI endpoint",
                  icon: Database,
                },
                {
                  id: "copilot",
                  label: "Copilot API",
                  detail: "Local copilot-api gateway",
                  icon: Layers,
                },
              ] as const
            ).map((option) => {
              const active = connectivity.embedding_provider === option.id;
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  disabled={saving}
                  onClick={() => void selectProvider(option.id)}
                  className={cn(
                    "group relative flex min-w-0 items-start gap-2 rounded-md border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
                    "focus-visible:ring-2 focus-visible:ring-(--color-primary)/40 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70",
                    active
                      ? "border-brand bg-primary/10"
                      : "border-border bg-card hover:border-(--color-primary)/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      active
                        ? "bg-(--color-primary) text-(--text-button-primary)"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 pr-4">
                    <span className="text-foreground block text-xs font-semibold">
                      {option.label}
                    </span>
                    <span className="text-xxs text-muted-foreground mt-0.5 block leading-snug">
                      {option.detail}
                    </span>
                  </span>
                  {active ? (
                    <CheckCircle
                      className="absolute top-2 right-2 h-3.5 w-3.5 text-(--color-primary)"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="border-border/60 bg-muted/20 border-t px-3 py-2">
            <div className="text-xxs text-muted-foreground flex items-center gap-1.5">
              {saving ? (
                <Loader2
                  className="h-3 w-3 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Database
                  className="h-3 w-3"
                  aria-hidden="true"
                />
              )}
              <span className="font-medium">Selection source:</span>
              <span>
                {settingSourceLabel(connectivity.embedding_provider_source)}
              </span>
            </div>
            <p className="text-xxs text-muted-foreground mt-1 leading-relaxed">
              Rebuild existing vector shelves after switching providers so
              stored and query embeddings use the same vector space.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Proxy-mode composer upload policy for the Sources destination. */
export function AttachmentPolicySection() {
  const { connectivity, setConnectivity, loading, error, retry } =
    useAdminConnectivity("Failed to load attachment settings");
  const [saving, setSaving] = useState(false);
  const { refresh } = useConnectivity();

  const toggleAttachments = async (checked: boolean) => {
    setSaving(true);
    try {
      const updated = await apiSetAdminConnectivity({
        proxy_attachments_enabled: checked,
      });
      setConnectivity(updated);
      void refresh();
      toast.success(
        checked
          ? "Attachments enabled in Proxy mode"
          : "Attachments disabled in Proxy mode"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update attachment policy"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader title="Chat uploads" />
      {loading ? (
        <ConnectivityLoadingState />
      ) : error ? (
        <ConnectivityLoadError
          message={error}
          onRetry={retry}
        />
      ) : connectivity ? (
        <div className="aptiv-glass-soft overflow-hidden rounded-lg shadow-sm">
          <div className="flex items-start gap-3 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--color-primary)/10 text-(--color-primary)">
              <Paperclip
                className="h-4 w-4"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="proxy-chat-attachments"
                  className="text-foreground text-sm font-semibold"
                >
                  Chat file and image uploads
                </Label>
                <span className="bg-muted text-xxs text-muted-foreground rounded-full px-2 py-0.5 font-semibold tracking-widest uppercase">
                  Proxy only
                </span>
              </div>
              <p
                id="proxy-chat-attachments-description"
                className="text-muted-foreground text-xs leading-relaxed"
              >
                Controls uploads from the chat composer for users routed through
                the local proxy. Remote and gateway modes are not affected.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {saving ? (
                <Loader2
                  className="text-muted-foreground h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : null}
              <Switch
                id="proxy-chat-attachments"
                checked={connectivity.proxy_attachments_enabled}
                disabled={saving}
                onCheckedChange={toggleAttachments}
                aria-describedby="proxy-chat-attachments-description"
              />
            </div>
          </div>
          <div className="border-border/60 bg-muted/20 text-xxs text-muted-foreground flex items-center gap-1.5 border-t px-3 py-2">
            <Database
              className="h-3 w-3"
              aria-hidden="true"
            />
            <span className="font-medium">Policy source:</span>
            <span>
              {settingSourceLabel(
                connectivity.proxy_attachments_enabled_source
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Provider endpoints and write-only credentials for each connection mode. */
export function UrlOverridesSection() {
  const { connectivity, setConnectivity, loading, error, retry } =
    useAdminConnectivity("Failed to load connectivity settings");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tokenDraft, setTokenDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!connectivity) return;
    setDraft(
      Object.fromEntries(
        Object.entries(connectivity.urls).map(([key, info]) => [
          key,
          info.value,
        ])
      )
    );
    setTokenDraft({});
  }, [connectivity]);

  const dirty = connectivity
    ? Object.keys(tokenDraft).length > 0 ||
      Object.entries(draft).some(
        ([key, value]) => value !== (connectivity.urls[key]?.value ?? "")
      )
    : false;
  useSettingsDraft(dirty || saving);

  const saveUrls = async () => {
    if (!connectivity || !dirty) return;
    const payload: AdminConnectivityUpdatePayload = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value !== (connectivity.urls[key]?.value ?? "")) {
        (payload as Record<string, string>)[key] = value;
      }
    }
    Object.assign(payload, tokenDraft);
    setSaving(true);
    try {
      const updated = await apiSetAdminConnectivity(payload);
      setConnectivity(updated);
      toast.success("Connectivity overrides saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save connectivity"
      );
    } finally {
      setSaving(false);
    }
  };

  const changeToken = (key: string, value: string | undefined) => {
    setTokenDraft((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  return (
    <DisclosureSection
      title="Provider endpoints"
      contentClassName="space-y-4"
    >
      {loading ? (
        <ConnectivityLoadingState />
      ) : error ? (
        <ConnectivityLoadError
          message={error}
          onRetry={retry}
        />
      ) : connectivity ? (
        <>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Configure each provider independently. Clear a base URL to restore
            its environment default.
          </p>
          {ENDPOINT_PROVIDERS.map((provider) => (
            <ProviderEndpointFields
              key={provider.id}
              provider={provider}
              connectivity={connectivity}
              urls={draft}
              tokens={tokenDraft}
              disabled={saving}
              onUrlChange={(key, value) =>
                setDraft((current) => ({ ...current, [key]: value }))
              }
              onTokenChange={changeToken}
            />
          ))}
          <div className="border-border @container space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <h4 className="text-foreground text-sm font-semibold">
                Cloudflare authentication
              </h4>
              <p className="text-xxs text-muted-foreground leading-relaxed">
                Shared across Cloudflare gateways. Provider tokens are optional
                when the gateway stores the provider key.
              </p>
            </div>
            <ConnectivityTokenField
              settingKey="cf_aig_token"
              label="Cloudflare gateway token (optional)"
              info={connectivity.tokens?.cf_aig_token}
              draft={tokenDraft.cf_aig_token}
              disabled={saving}
              onChange={(value) => changeToken("cf_aig_token", value)}
            />
          </div>
          <div className="border-border space-y-3 border-t pt-4">
            <p className="text-xxs text-muted-foreground leading-relaxed">
              Blank token fields keep saved credentials. Reset clears an
              override and restores the provider environment token. Saved tokens
              are never displayed.
            </p>
            <p
              role="status"
              className="text-xxs text-muted-foreground font-medium"
            >
              {saving
                ? "Saving changes…"
                : dirty
                  ? "Unsaved changes"
                  : "All changes saved"}
            </p>
            <Button
              type="button"
              onClick={() => void saveUrls()}
              disabled={saving || !dirty}
              className="min-h-10 w-full"
            >
              {saving ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Save
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {saving ? "Saving…" : "Save connectivity overrides"}
            </Button>
          </div>
        </>
      ) : null}
    </DisclosureSection>
  );
}

function settingSourceLabel(source: string): string {
  switch (source) {
    case "database":
      return "Custom override saved by an admin";
    case "env":
      return "Environment default (.env)";
    default:
      return source;
  }
}
