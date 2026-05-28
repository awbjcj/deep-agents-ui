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
import {
  apiAcknowledgeNotification,
  apiListNotifications,
  apiSnoozeNotification,
  type UserNotification,
} from "@/lib/auth";
import { useAuth } from "@/providers/AuthProvider";

export type StreamNotificationEvent = {
  kind: "notification";
  scope: "thread" | "user";
  severity: "info" | "warning" | "error";
  code: string;
  title: string;
  message: string;
  action?: {
    label: string;
    target: string;
    params?: Record<string, string>;
  };
  notification_id: number | null;
};

interface NotificationsContextValue {
  notifications: UserNotification[];
  acknowledge: (id: number) => Promise<void>;
  snooze: (id: number, hours?: number) => Promise<void>;
  /** Called by useChat when a `custom` stream event arrives. */
  ingestStreamEvent: (event: StreamNotificationEvent) => void;
  /** Called by TokenManagementSidebar after a successful token update. */
  applyClearedNotifications: (cleared: UserNotification[]) => void;
  /** Records a requested deep-link target ("graph", "jira", ...) for the sidebar. */
  pendingTokenFocus: string | null;
  requestTokenFocus: (service: string | null) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [pendingTokenFocus, setPendingTokenFocus] = useState<string | null>(
    null
  );

  // Load active notifications once the user is authenticated. We never poll;
  // updates arrive via `ingestStreamEvent` from the live custom stream.
  useEffect(() => {
    if (!user?.access_token) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    apiListNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items);
      })
      .catch((err) =>
        console.warn("Failed to load notifications on mount:", err)
      );
    return () => {
      cancelled = true;
    };
  }, [user?.access_token]);

  const acknowledge = useCallback(async (id: number) => {
    await apiAcknowledgeNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const snooze = useCallback(async (id: number, hours = 1) => {
    await apiSnoozeNotification(id, hours);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const ingestStreamEvent = useCallback((event: StreamNotificationEvent) => {
    if (event.scope !== "user" || event.notification_id == null) return;
    setNotifications((prev) => {
      const synthesized: UserNotification = {
        id: event.notification_id!,
        code: event.code,
        severity: event.severity,
        title: event.title,
        message: event.message,
        action_label: event.action?.label ?? null,
        action_target: event.action?.target ?? null,
        action_params: event.action?.params ?? null,
        created_at: new Date().toISOString(),
        snoozed_until: null,
      };
      const idx = prev.findIndex((n) => n.id === event.notification_id);
      if (idx === -1) return [synthesized, ...prev];
      const next = [...prev];
      next[idx] = synthesized;
      return next;
    });
  }, []);

  const applyClearedNotifications = useCallback(
    (cleared: UserNotification[]) => {
      if (!cleared.length) return;
      const clearedIds = new Set(cleared.map((c) => c.id));
      const clearedCodes = new Set(cleared.map((c) => c.code));
      setNotifications((prev) =>
        prev.filter(
          (n) => !clearedIds.has(n.id) && !clearedCodes.has(n.code)
        )
      );
    },
    []
  );

  const requestTokenFocus = useCallback((service: string | null) => {
    setPendingTokenFocus(service);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      acknowledge,
      snooze,
      ingestStreamEvent,
      applyClearedNotifications,
      pendingTokenFocus,
      requestTokenFocus,
    }),
    [
      notifications,
      acknowledge,
      snooze,
      ingestStreamEvent,
      applyClearedNotifications,
      pendingTokenFocus,
      requestTokenFocus,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider"
    );
  }
  return ctx;
}
