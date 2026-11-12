"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
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
  refreshNotifications: () => void;
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
const EMPTY_NOTIFICATIONS: UserNotification[] = [];

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pendingTokenFocus, setPendingTokenFocus] = useState<string | null>(
    null
  );
  const { data: notifications = EMPTY_NOTIFICATIONS, mutate } = useSWR(
    user?.access_token ? ["user-notifications", user.user_id] : null,
    apiListNotifications,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      onError: (err) => console.warn("Failed to load notifications:", err),
    }
  );

  const refreshNotifications = useCallback(() => {
    void mutate();
  }, [mutate]);

  const acknowledge = useCallback(
    async (id: number) => {
      await apiAcknowledgeNotification(id);
      await mutate((prev) => prev?.filter((n) => n.id !== id), false);
    },
    [mutate]
  );

  const snooze = useCallback(
    async (id: number, hours = 1) => {
      await apiSnoozeNotification(id, hours);
      await mutate((prev) => prev?.filter((n) => n.id !== id), false);
    },
    [mutate]
  );

  const ingestStreamEvent = useCallback(
    (event: StreamNotificationEvent) => {
      const id = event.notification_id;
      if (event.scope !== "user" || id == null) return;
      const synthesized: UserNotification = {
        id,
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
      void mutate((prev = EMPTY_NOTIFICATIONS) => {
        const idx = prev.findIndex((n) => n.id === id);
        if (idx === -1) return [synthesized, ...prev];
        const next = [...prev];
        next[idx] = synthesized;
        return next;
      }, false);
    },
    [mutate]
  );

  const applyClearedNotifications = useCallback(
    (cleared: UserNotification[]) => {
      if (!cleared.length) return;
      const clearedIds = new Set(cleared.map((c) => c.id));
      void mutate((prev) => prev?.filter((n) => !clearedIds.has(n.id)), false);
    },
    [mutate]
  );

  const requestTokenFocus = useCallback((service: string | null) => {
    setPendingTokenFocus(service);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      refreshNotifications,
      acknowledge,
      snooze,
      ingestStreamEvent,
      applyClearedNotifications,
      pendingTokenFocus,
      requestTokenFocus,
    }),
    [
      notifications,
      refreshNotifications,
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
