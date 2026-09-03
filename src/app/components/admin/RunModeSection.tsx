"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircle,
  Clock,
  Database,
  Layers,
  Loader2,
  Paperclip,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AdminConnectivityResponse,
  AdminConnectivityUpdatePayload,
  apiGetAdminConnectivity,
  apiGetRunMode,
  apiSetAdminConnectivity,
  apiSetRunMode,
  type EmbeddingProvider,
  RunMode,
  RunModeInfo,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { LoadingRow, SectionHeader } from "@/app/components/admin/primitives";

const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

export function RunModeSection() {
  const [pending, setPending] = useState<RunMode>("gateway");
  const [info, setInfo] = useState<RunModeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiGetRunMode()
      .then((data) => {
        setPending(data.run_mode);
        setInfo(data);
      })
      .catch(() => toast.error("Failed to load run mode"))
      .finally(() => setIsLoading(false));
  }, []);

  // Clear the "Saved" timer on unmount so we never setState after teardown.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

  const dirty = info !== null && pending !== info.run_mode;

  const handleSave = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const updated = await apiSetRunMode(pending);
      setPending(updated.run_mode);
      setInfo(updated);
      setSaved(true);
      toast.success("Run mode saved");
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save run mode"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // WAI-ARIA radio group keyboard contract: arrow keys move + select, Home/End
  // jump to ends. Roving tabindex below means only the active option is in the
  // tab order, so Tab enters/exits the group as a single stop.
  const handleRadioKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const last = RUN_MODES.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? last : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = RUN_MODES[nextIndex]!;
    setPending(target);
    radioRefs.current[nextIndex]?.focus();
  };

  // --- URL Overrides ---
  const [connectivity, setConnectivity] =
    useState<AdminConnectivityResponse | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [isSavingUrls, setIsSavingUrls] = useState(false);

  useEffect(() => {
    apiGetAdminConnectivity()
      .then((data) => {
        setConnectivity(data);
        const draft: Record<string, string> = {};
        for (const [key, info] of Object.entries(data.urls)) {
          draft[key] = info.value;
        }
        setUrlDraft(draft);
      })
      .catch(() => toast.error("Failed to load URL settings"));
  }, []);

  const urlsDirty = connectivity
    ? Object.entries(urlDraft).some(
        ([key, val]) => val !== (connectivity.urls[key]?.value ?? "")
      )
    : false;

  const handleSaveUrls = async () => {
    if (!urlsDirty) return;
    setIsSavingUrls(true);
    try {
      const payload: AdminConnectivityUpdatePayload = {};
      for (const [key, val] of Object.entries(urlDraft)) {
        if (val !== (connectivity?.urls[key]?.value ?? "")) {
          (payload as Record<string, string>)[key] = val;
        }
      }
      const updated = await apiSetAdminConnectivity(payload);
      setConnectivity(updated);
      const freshDraft: Record<string, string> = {};
      for (const [key, info] of Object.entries(updated.urls)) {
        freshDraft[key] = info.value;
      }
      setUrlDraft(freshDraft);
      toast.success("URL overrides saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save URLs");
    } finally {
      setIsSavingUrls(false);
    }
  };

  // --- Proxy attachments switch ---
  // Saved on toggle rather than behind the URL "Save" button: it is a single
  // boolean policy, and admins expect it to take effect immediately.
  const [isTogglingAttachments, setIsTogglingAttachments] = useState(false);
  const { refresh: refreshConnectivity } = useConnectivity();

  const handleToggleAttachments = async (checked: boolean) => {
    setIsTogglingAttachments(true);
    try {
      const updated = await apiSetAdminConnectivity({
        proxy_attachments_enabled: checked,
      });
      setConnectivity(updated);
      // Re-pull the admin's own connectivity so their composer reflects the new
      // policy without a reload. Other sessions pick it up on their next fetch;
      // the upload endpoint enforces it in the meantime.
      void refreshConnectivity();
      toast.success(
        checked
          ? "Attachments enabled in Proxy mode"
          : "Attachments disabled in Proxy mode"
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update attachment policy"
      );
    } finally {
      setIsTogglingAttachments(false);
    }
  };

  // --- Embedding provider ---
  // This is a system ingestion policy, so a selection is persisted immediately
  // and used by both new vectors and query-time embeddings.
  const [isSavingEmbeddingProvider, setIsSavingEmbeddingProvider] =
    useState(false);

  const handleEmbeddingProviderChange = async (provider: EmbeddingProvider) => {
    if (!connectivity || provider === connectivity.embedding_provider) return;
    setIsSavingEmbeddingProvider(true);
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
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update embedding provider"
      );
    } finally {
      setIsSavingEmbeddingProvider(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Connectivity"
        subtitle="How agent requests reach the LLM backend"
      />

      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="aptiv-glass-soft space-y-3 rounded-lg p-4 shadow-sm">
          <div
            role="radiogroup"
            aria-label="Modes"
            className="grid grid-cols-3 gap-1.5"
          >
            {RUN_MODES.map((mode, index) => {
              const active = pending === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  ref={(el) => {
                    radioRefs.current[index] = el;
                  }}
                  onKeyDown={(event) => handleRadioKeyDown(event, index)}
                  onClick={() => setPending(mode)}
                  className={cn(
                    "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-all duration-200",
                    "focus-visible:ring-[var(--color-primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--text-button-primary)] shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
                      : "hover:border-[var(--color-primary)]/40 border-border bg-card hover:-translate-y-px hover:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--aptiv-orange)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--aptiv-orange)_25%,transparent)]"
                    />
                  )}
                  <span
                    className={cn(
                      "text-xs font-semibold tracking-tight transition-colors",
                      active
                        ? "text-[var(--text-button-primary)]"
                        : "text-foreground group-hover:text-[var(--color-primary)]"
                    )}
                  >
                    {mode}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors",
                      active
                        ? "text-[var(--text-button-primary)]/75"
                        : "text-muted-foreground"
                    )}
                  >
                    {runModeBlurb(mode)}
                  </span>
                </button>
              );
            })}
          </div>

          {info && info.run_mode_updated_at !== "Unknown" && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="font-semibold uppercase tracking-wider">
                Updated
              </span>
              <time
                className="font-mono tabular-nums"
                dateTime={info.run_mode_updated_at}
              >
                {formatTimestamp(info.run_mode_updated_at)}
              </time>
              <span className="text-muted-foreground/70">
                ({info.run_mode_time_gap})
              </span>
            </div>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : saved ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save run mode
              </>
            )}
          </Button>
        </div>
      )}

      {connectivity && (
        <div className="space-y-3 border-t border-border/40 pt-5">
          <SectionHeader
            title="Document embeddings"
            subtitle="Choose the API used by library ingestion and semantic retrieval"
          />

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
                    disabled={isSavingEmbeddingProvider}
                    onClick={() =>
                      void handleEmbeddingProviderChange(option.id)
                    }
                    className={cn(
                      "group relative flex min-w-0 items-start gap-2.5 rounded-md border p-3 text-left transition-all duration-200",
                      "focus-visible:ring-[var(--color-primary)]/40 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-70",
                      active
                        ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] shadow-[inset_3px_0_0_var(--color-primary)]"
                        : "hover:border-[var(--color-primary)]/40 border-border bg-card hover:-translate-y-px"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                        active
                          ? "bg-[var(--color-primary)] text-[var(--text-button-primary)]"
                          : "bg-muted text-muted-foreground group-hover:text-[var(--color-primary)]"
                      )}
                    >
                      <Icon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                        {option.detail}
                      </span>
                    </span>
                    {active && (
                      <CheckCircle
                        className="absolute right-2 top-2 h-3.5 w-3.5 text-[var(--color-primary)]"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {isSavingEmbeddingProvider ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
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
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">
                Rebuild existing vector shelves after switching providers so
                stored and query embeddings use the same vector space.
              </p>
            </div>
          </div>
        </div>
      )}

      {connectivity && (
        <div className="space-y-3 border-t border-border/40 pt-5">
          <SectionHeader
            title="Attachments"
            subtitle="File and image uploads in the chat composer"
          />

          <div className="aptiv-glass-soft overflow-hidden rounded-lg shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <span className="bg-[var(--color-primary)]/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-primary)]">
                <Paperclip
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor="proxy-chat-attachments"
                    className="text-sm font-semibold text-foreground"
                  >
                    Chat file and image uploads
                  </Label>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Proxy only
                  </span>
                </div>
                <p
                  id="proxy-chat-attachments-description"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Controls uploads from the chat composer for users routed
                  through the local proxy. Remote and gateway modes are not
                  affected.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                {isTogglingAttachments && (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <Switch
                  id="proxy-chat-attachments"
                  checked={connectivity.proxy_attachments_enabled}
                  disabled={isTogglingAttachments}
                  onCheckedChange={handleToggleAttachments}
                  aria-describedby="proxy-chat-attachments-description"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">
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
        </div>
      )}

      {connectivity && (
        <div className="space-y-3 border-t border-border/40 pt-5">
          <SectionHeader
            title="URL Overrides"
            subtitle="Override environment URLs for each provider and mode. Empty = use .env default."
          />

          {(
            [
              { id: "openai", label: "OpenAI", prefix: "openai_base_url" },
              {
                id: "anthropic",
                label: "Anthropic",
                prefix: "claude_base_url",
              },
              { id: "gemini", label: "Gemini", prefix: "google_base_url" },
            ] as const
          ).map((provider) => (
            <div
              key={provider.id}
              className="space-y-2"
            >
              <p className="aptiv-eyebrow">{provider.label}</p>
              {(["remote", "gateway", "proxy"] as const).map((mode) => {
                const key = `${provider.prefix}${
                  mode === "remote" ? "" : `_${mode}`
                }`;
                const info = connectivity.urls[key];
                return (
                  <div
                    key={key}
                    className="space-y-1"
                  >
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {mode} URL
                    </Label>
                    <Input
                      value={urlDraft[key] ?? ""}
                      onChange={(e) =>
                        setUrlDraft((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder="(not set — using .env)"
                      className={cn(
                        "h-9 font-mono text-[11px]",
                        info?.source === "database" && info.value
                          ? "border-primary/40"
                          : ""
                      )}
                    />
                    <span
                      className={cn(
                        "text-[9px]",
                        info?.source === "database" && info.value
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      Source: {info?.source ?? "env"}
                      {info?.source === "database" && info.updated_at && (
                        <> · Updated {formatTimestamp(info.updated_at)}</>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          <Button
            type="button"
            onClick={handleSaveUrls}
            disabled={isSavingUrls || !urlsDirty}
            className="w-full"
          >
            {isSavingUrls ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save URL overrides
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function runModeBlurb(mode: RunMode): string {
  switch (mode) {
    case "remote":
      return "Direct provider";
    case "gateway":
      return "Via gateway";
    case "proxy":
      return "Via proxy";
  }
}

// Backend setting sources are the literal strings "database" (an admin has
// saved an override) or "env" (falling back to the .env-configured default).
// Surface them as a plain-language label instead of the raw enum value so an
// admin doesn't have to guess what "database" means in this context.
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
