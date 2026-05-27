"use client";

import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, Clock, Link, Loader2, RotateCcw, Save, X } from "lucide-react";
import {
  apiGetUserConnectivity,
  apiSetUserConnectivity,
  RunMode,
  UserConnectivityResponse,
} from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

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

function runModeDescription(mode: RunMode): string {
  switch (mode) {
    case "remote":
      return "Connect directly to OpenAI / Anthropic APIs (Lowest latency, could be blocked by network firewalls)";
    case "gateway":
      return "Route through VSDA Team Maintained Gateway (Recommended, best performance and reliability)";
    case "proxy":
      return "Route through local Copilot Proxy with Github Copilot Subscription (Requires setup, may have higher latency)";
  }
}

interface ConnectivitySidebarProps {
  onClose: () => void;
}

export function ConnectivitySidebar({ onClose }: ConnectivitySidebarProps) {
  const [data, setData] = useState<UserConnectivityResponse | null>(null);
  const [pendingMode, setPendingMode] = useState<RunMode>("gateway");
  const [proxyUrl, setProxyUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    apiGetUserConnectivity()
      .then((res) => {
        if (!mounted) return;
        setData(res);
        setPendingMode(res.run_mode);
        setProxyUrl(res.proxy_url);
      })
      .catch(() => {
        if (mounted) toast.error("Failed to load connectivity settings");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

  const dirty =
    data !== null &&
    (pendingMode !== data.run_mode || proxyUrl !== data.proxy_url);

  const handleSave = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const payload: { run_mode?: RunMode | null; proxy_url?: string | null } = {};
      if (pendingMode !== data?.run_mode) {
        payload.run_mode = pendingMode;
      }
      if (proxyUrl !== data?.proxy_url) {
        payload.proxy_url = proxyUrl || null;
      }
      const updated = await apiSetUserConnectivity(payload);
      setData(updated);
      setPendingMode(updated.run_mode);
      setProxyUrl(updated.proxy_url);
      setSaved(true);
      toast.success("Connectivity saved");
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      const updated = await apiSetUserConnectivity({
        run_mode: null,
        proxy_url: null,
      });
      setData(updated);
      setPendingMode(updated.run_mode);
      setProxyUrl(updated.proxy_url);
      toast.success("Reset to system defaults");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setIsSaving(false);
    }
  };

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
    setPendingMode(target);
    radioRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Link className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Connectivity</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close connectivity sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-5 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <header className="space-y-1">
                <h3 className="text-base font-semibold tracking-tight">Run mode</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  How your requests reach the LLM backend
                </p>
                <span className="aptiv-rule" aria-hidden="true" />
              </header>

              <div className="aptiv-glass-soft space-y-3 rounded-lg p-4 shadow-sm">
                <div
                  role="radiogroup"
                  aria-label="Run mode"
                  className="grid grid-cols-3 gap-1.5"
                >
                  {RUN_MODES.map((mode, index) => {
                    const active = pendingMode === mode;
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
                        onClick={() => setPendingMode(mode)}
                        className={cn(
                          "group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-all duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                          active
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--text-button-primary)] shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
                            : "border-border bg-card hover:-translate-y-px hover:border-[var(--color-primary)]/40 hover:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
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

                {data && (
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    {runModeDescription(pendingMode)}
                  </p>
                )}

                {data && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="font-semibold uppercase tracking-wider">
                      System default
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
                      {data.default_run_mode}
                    </span>
                    {data.run_mode_source === "user" && (
                      <span className="text-[var(--color-primary)]">
                        &middot; Your override active
                      </span>
                    )}
                  </div>
                )}
              </div>

              {pendingMode === "proxy" && (
                <div className="space-y-2 border-t border-border/40 pt-4">
                  <header className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-tight">Proxy URL</h3>
                    <p className="text-[10px] text-muted-foreground">
                      Your personal proxy endpoint. Leave empty to use the system default.
                    </p>
                  </header>
                  <Input
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="(not set — using system proxy)"
                    className={cn(
                      "h-9 font-mono text-[11px]",
                      proxyUrl ? "border-[var(--color-primary)]/40" : ""
                    )}
                  />
                  {data?.proxy_url_source === "user" && data.proxy_url && (
                    <span className="text-[9px] text-[var(--color-primary)]">
                      Using your custom proxy URL
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
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
                      Save connectivity
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSaving}
                  className="inline-flex w-full items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to system defaults
                </button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
