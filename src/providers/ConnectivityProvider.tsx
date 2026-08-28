"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGetUserConnectivity, type RunMode } from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

interface ConnectivityContextValue {
  /** Current effective run mode, or null until the first fetch resolves. */
  runMode: RunMode | null;
  /** Convenience flag for gating proxy-only behaviour. */
  isProxyMode: boolean;
  /**
   * Whether chat attachments may be uploaded right now. Always true outside
   * Proxy mode; under Proxy it follows the admin switch resolved by the
   * backend. Fails open (true) while loading or on a fetch error — the upload
   * endpoint enforces the same policy, so a permissive UI can only produce a
   * 403, never an unauthorized upload.
   */
  attachmentsEnabled: boolean;
  isLoading: boolean;
  /** Refetch connectivity from the server. */
  refresh: () => Promise<void>;
  /**
   * Optimistically update the run mode without a round trip — used by the
   * connectivity sidebar so other consumers (the chat composer) react to a
   * mode change immediately.
   */
  setRunModeLocal: (mode: RunMode) => void;
}

const ConnectivityContext = createContext<ConnectivityContextValue | null>(
  null
);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [runMode, setRunMode] = useState<RunMode | null>(null);
  // The admin switch, kept separate from the effective flag so an optimistic
  // run-mode change re-derives attachment availability without a round trip.
  const [proxyAttachmentsEnabled, setProxyAttachmentsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.access_token) {
      setRunMode(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiGetUserConnectivity();
      setRunMode(res.run_mode);
      setProxyAttachmentsEnabled(res.proxy_attachments_enabled ?? true);
    } catch {
      // Best effort: keep the previous value. Attachment gating fails open
      // (enabled) so a transient fetch error never strands the upload UI.
    } finally {
      setIsLoading(false);
    }
  }, [user?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setRunModeLocal = useCallback((mode: RunMode) => {
    setRunMode(mode);
  }, []);

  const value = useMemo<ConnectivityContextValue>(
    () => ({
      runMode,
      isProxyMode: runMode === "proxy",
      attachmentsEnabled: runMode === "proxy" ? proxyAttachmentsEnabled : true,
      isLoading,
      refresh,
      setRunModeLocal,
    }),
    [runMode, proxyAttachmentsEnabled, isLoading, refresh, setRunModeLocal]
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    throw new Error(
      "useConnectivity must be used within a ConnectivityProvider"
    );
  }
  return ctx;
}
