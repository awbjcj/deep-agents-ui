"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link, Loader2, Save, X } from "lucide-react";
import {
  apiGetUserConnectivity,
  apiSetUserConnectivity,
  RunMode,
  UserConnectivityResponse,
} from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ConnectivitySidebarProps {
  onClose: () => void;
}

export function ConnectivitySidebar({ onClose }: ConnectivitySidebarProps) {
  const [data, setData] = useState<UserConnectivityResponse | null>(null);
  const [pendingMode, setPendingMode] = useState<RunMode>("gateway");
  const [proxyUrl, setProxyUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    apiGetUserConnectivity()
      .then((res) => {
        setData(res);
        setPendingMode(res.run_mode);
        setProxyUrl(res.proxy_url);
      })
      .catch(() => toast.error("Failed to load connectivity settings"))
      .finally(() => setIsLoading(false));
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
      toast.success("Connectivity saved");
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

  const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header (hidden by PanelChrome in WorkspacePanel) */}
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
        <div className="space-y-6 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Run mode
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {RUN_MODES.map((mode) => {
                    const active = pendingMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPendingMode(mode)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-center text-xs font-semibold transition-all",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-foreground hover:border-primary/40"
                        )}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
                {data && (
                  <p className="text-[9px] text-muted-foreground">
                    System default: {data.default_run_mode}
                    {data.run_mode_source === "user" && " · Your choice: " + data.run_mode}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  My proxy URL
                </Label>
                <Input
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="(not set — using system proxy)"
                  className="h-9 font-mono text-[11px]"
                />
                <p className="text-[9px] text-muted-foreground">
                  Used when run mode is &quot;proxy&quot;. Leave empty for system default.
                </p>
              </div>

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
                className="w-full text-center text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Reset to system defaults
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
