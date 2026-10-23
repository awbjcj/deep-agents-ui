"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowUpRight,
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  teamsChatAPI,
  teamsConversationHref,
  type TeamsBinding,
} from "@/lib/teams-chat";
import { TeamsChatSetup } from "./teams-chat/TeamsChatSetup";

/** Mount with an account key so pending actions cannot update another user's UI. */
export function TeamsChatSettings({
  accountId,
  onManageToken,
}: {
  accountId: string;
  onManageToken: () => void;
}) {
  const {
    data: binding,
    error: loadError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(["teams-chat-binding", accountId], teamsChatAPI.status, {
    shouldRetryOnError: false,
  });
  const [pendingAction, setPendingAction] = useState<"save" | "refresh" | null>(
    null
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unverified, setUnverified] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = pendingAction !== null || isLoading || isValidating;

  async function action(
    operation: () => Promise<TeamsBinding | null>,
    success: string,
    write = true
  ) {
    if (busyRef.current || busy) return;
    busyRef.current = true;
    setPendingAction(write ? "save" : "refresh");
    setError("");
    setNotice("");
    try {
      // SWR discards older in-flight reads; the switch never shows an optimistic save.
      await mutate(operation, { revalidate: false, throwOnError: true });
      if (mounted.current) {
        setUnverified(false);
        setNotice(success);
      }
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save Teams settings."
      );
      setUnverified(true);
      if (write) {
        // A lost response may still have committed. Read back, never replay the write.
        try {
          await mutate(teamsChatAPI.status(), {
            revalidate: false,
            throwOnError: true,
          });
          if (mounted.current) {
            setUnverified(false);
            setNotice("Showing the current saved setting.");
          }
        } catch {
          /* Keep controls locked until status can be verified. */
        }
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setPendingAction(null);
    }
  }

  const refresh = () =>
    void action(teamsChatAPI.status, "Teams settings refreshed.", false);
  return (
    <div className="absolute inset-0 flex flex-col">
      <ScrollArea className="h-0 flex-1">
        <div className="mx-auto max-w-2xl space-y-5 p-4 text-foreground">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
              <MessageSquare
                aria-hidden="true"
                className="size-5"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">Your agent, in Teams</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Send requests and pick up replies in your private self-chat.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Refresh Teams status"
              disabled={busy}
              onClick={refresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={busy ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>

          {isLoading && (
            <p
              role="status"
              className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            >
              <Loader2
                aria-hidden="true"
                className="size-4 motion-safe:animate-spin"
              />
              Loading Teams settings…
            </p>
          )}
          {(error || loadError) && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <p className="break-words">
                {error ||
                  (loadError instanceof Error
                    ? loadError.message
                    : "Could not load Teams settings.")}
              </p>
              {(unverified || loadError) && (
                <p className="text-muted-foreground">
                  Refresh status to verify your saved preference before making
                  another change.
                </p>
              )}
              <Button
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={refresh}
              >
                Refresh status
              </Button>
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className="min-h-5 text-sm text-muted-foreground"
          >
            {pendingAction === "save"
              ? "Saving…"
              : pendingAction === "refresh"
              ? "Refreshing status…"
              : notice}
          </p>

          {binding && (
            <section
              aria-labelledby="teams-enable-label"
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <Label
                    id="teams-enable-label"
                    htmlFor="teams-enabled"
                    className="text-sm font-semibold"
                  >
                    Enable Teams chat
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {unverified || loadError
                      ? "Status unknown · refresh to confirm"
                      : binding.enabled
                      ? binding.worker_enabled
                        ? "On · listening for your requests"
                        : "On · waiting for service availability"
                      : "Off · messages are paused"}
                  </p>
                </div>
                <Switch
                  id="teams-enabled"
                  checked={binding.enabled}
                  disabled={
                    busy ||
                    unverified ||
                    Boolean(loadError) ||
                    (!binding.worker_enabled && !binding.enabled)
                  }
                  aria-describedby="teams-toggle-description"
                  className="h-6 w-11 data-[state=unchecked]:bg-foreground/50 motion-reduce:transition-none [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-[22px] [&_[data-slot=switch-thumb]]:motion-reduce:transition-none"
                  onCheckedChange={(enabled) =>
                    void action(
                      () => teamsChatAPI.setEnabled(enabled),
                      enabled ? "Teams chat enabled." : "Teams chat disabled."
                    )
                  }
                />
              </div>
              <div
                id="teams-toggle-description"
                className="space-y-2 border-t border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
              >
                <p>
                  Turning this off pauses requests and replies. A task already
                  running continues; open the conversation to stop it.
                </p>
                <p>
                  Turning it back on catches up on{" "}
                  <code className="font-mono text-foreground">/agent</code>{" "}
                  commands sent while off.
                </p>
              </div>
            </section>
          )}
          {binding && !binding.worker_enabled && (
            <p
              role="status"
              className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed"
            >
              Teams chat is unavailable on this server. Ask an administrator to
              enable it. Your preference is saved
              {binding.enabled
                ? " and will take effect when the service is available"
                : ""}
              .
            </p>
          )}
          {binding?.last_error && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">Connection needs attention</p>
              <p className="mt-1 break-words text-muted-foreground">
                {binding.last_error}
              </p>
            </div>
          )}
          {binding?.mode === "autopilot" && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">Autopilot is selected</p>
              <p className="leading-relaxed text-muted-foreground">
                While Teams chat is on, eligible actions can be approved
                automatically. Switch to Interactive to review them yourself.
              </p>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={busy || unverified || Boolean(loadError)}
                onClick={() =>
                  void action(
                    teamsChatAPI.useInteractive,
                    "Interactive mode selected."
                  )
                }
              >
                Use Interactive mode
              </Button>
            </div>
          )}
          {binding && (
            <div className="space-y-3">
              <Button
                asChild
                variant="outline"
                className="min-h-11 w-full"
              >
                <Link href={teamsConversationHref(binding.thread_id)}>
                  Open conversation
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              {binding.review && (
                <p className="text-sm text-muted-foreground">
                  A review is waiting. Open the conversation or answer the
                  review message in Teams.
                </p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  Connection details
                </summary>
                <dl className="space-y-2 rounded-lg bg-muted/30 p-3">
                  <dt className="text-muted-foreground">Self-chat ID</dt>
                  <dd className="break-all font-mono text-xs">
                    {binding.chat_id}
                  </dd>
                  <dt className="text-muted-foreground">Execution mode</dt>
                  <dd>
                    {binding.mode === "interactive"
                      ? "Interactive · you review actions"
                      : "Autopilot"}
                  </dd>
                </dl>
              </details>
            </div>
          )}
          {binding === null && !loadError && !unverified && (
            <div className="rounded-xl border border-border bg-card p-4">
              <TeamsChatSetup
                busy={busy}
                connecting={pendingAction === "save"}
                onConnect={(chatId) =>
                  void action(
                    () => teamsChatAPI.connect(chatId),
                    "Connected. Teams chat is enabled."
                  )
                }
              />
            </div>
          )}
          <div className="space-y-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-start px-2"
              onClick={onManageToken}
            >
              <KeyRound aria-hidden="true" />
              Manage Microsoft Graph token
            </Button>
            <p className="px-2 text-xs leading-relaxed text-muted-foreground">
              Your connection uses your account’s saved token. Refresh it here
              if Teams access expires.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
