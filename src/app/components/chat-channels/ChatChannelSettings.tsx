"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  chatChannelsAPI,
  channelOf,
  type ChannelId,
  type ChannelOverview,
} from "@/lib/chat-channels";
import { teamsChatAPI } from "@/lib/teams-chat";
import { ActiveConnection } from "./ActiveConnection";
import { CHANNEL_META, metaForTransport } from "./channel-meta";
import { ChannelDetail } from "./ChannelDetail";
import { ChannelPicker } from "./ChannelPicker";
import { UnlinkDialog } from "./UnlinkDialog";

function defaultChannel(overview: ChannelOverview | undefined): ChannelId {
  const active = overview?.binding && channelOf(overview.binding.transport);
  return (
    active ??
    overview?.channels.find((channel) => channel.available)?.id ??
    "teams"
  );
}

/**
 * Workspace → Bots. Mount with an account key so pending actions cannot
 * update another user's view. Writes are confirmed by reading the saved state
 * back; an unverifiable outcome locks controls until a refresh succeeds.
 */
export function ChatChannelSettings({
  accountId,
  onManageToken,
}: {
  accountId: string;
  onManageToken: () => void;
}) {
  const {
    data,
    error: loadError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(["chat-channels", accountId], () => chatChannelsAPI.overview(), {
    shouldRetryOnError: false,
  });
  const [selected, setSelected] = useState<ChannelId | null>(null);
  const [pending, setPending] = useState<"save" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [unlinking, setUnlinking] = useState<ChannelId | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = pending !== null || isLoading || isValidating;
  const locked = unverified || Boolean(loadError);
  const current = selected ?? defaultChannel(data);
  const binding = data?.binding ?? null;
  const activeChannel = binding ? channelOf(binding.transport) : null;

  async function run(
    operation: () => Promise<unknown>,
    success: string,
    write = true
  ): Promise<boolean> {
    // Refresh stays focusable during reads; the ref prevents overlapping actions.
    if (busyRef.current) return false;
    busyRef.current = true;
    setPending(write ? "save" : "refresh");
    setError("");
    setNotice("");
    try {
      await operation();
      await mutate(chatChannelsAPI.overview(), {
        revalidate: false,
        throwOnError: true,
      });
      if (mounted.current) {
        setUnverified(false);
        setNotice(success);
      }
      return true;
    } catch (cause) {
      if (!mounted.current) return false;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save chat app settings."
      );
      setUnverified(true);
      if (write) {
        // A lost response may still have committed. Read back; never replay.
        try {
          await mutate(chatChannelsAPI.overview(), {
            revalidate: false,
            throwOnError: true,
          });
          if (mounted.current) {
            setUnverified(false);
            setNotice("Showing your current saved settings.");
          }
        } catch {
          /* Keep controls locked until a refresh can verify state. */
        }
      }
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setPending(null);
    }
  }

  const refresh = () =>
    void run(() => Promise.resolve(), "Chat apps refreshed.", false);
  const currentMeta = binding ? metaForTransport(binding.transport) : null;
  const detail = data?.channels.find((channel) => channel.id === current);

  return (
    <div className="absolute inset-0 flex flex-col">
      <ScrollArea className="h-0 flex-1">
        <div className="mx-auto max-w-2xl space-y-5 p-4 text-foreground @container/bots">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold">
                Your agent, in your chat app
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Send tasks and approve actions from Microsoft Teams, Slack, or
                Telegram. One app is active at a time, and your conversation
                moves with you when you switch.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Refresh chat apps"
              aria-busy={pending === "refresh"}
              onClick={refresh}
            >
              <RefreshCw
                aria-hidden="true"
                className={busy ? "motion-safe:animate-spin" : ""}
              />
            </Button>
          </div>

          {isLoading && <OverviewSkeleton />}
          {(error || loadError) && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-error bg-error-secondary p-3 text-sm"
            >
              <p className="break-words">
                {error ||
                  (loadError instanceof Error
                    ? loadError.message
                    : "Could not load chat apps.")}
              </p>
              {locked && (
                <p className="text-muted-foreground">
                  Refresh to verify your saved settings before making another
                  change.
                </p>
              )}
              <Button
                variant="outline"
                className="min-h-11"
                aria-busy={pending === "refresh"}
                onClick={refresh}
              >
                Refresh status
              </Button>
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className="min-h-5 text-sm text-muted-foreground empty:min-h-0"
          >
            {pending === "save"
              ? "Saving…"
              : pending === "refresh"
              ? "Refreshing…"
              : notice}
          </p>

          {data && binding && (
            <ActiveConnection
              binding={binding}
              channel={
                data.channels.find((channel) => channel.id === activeChannel) ??
                null
              }
              busy={busy}
              locked={locked}
              onToggle={(enabled) =>
                void run(
                  () => teamsChatAPI.setEnabled(enabled),
                  `${currentMeta?.short} ${enabled ? "turned on" : "paused"}.`
                )
              }
              onInteractive={() =>
                void run(
                  teamsChatAPI.useInteractive,
                  "Interactive mode selected."
                )
              }
              onUnlink={() => activeChannel && setUnlinking(activeChannel)}
              onRelink={() => {
                setSelected(activeChannel ?? "teams");
                requestAnimationFrame(() => detailHeading.current?.focus());
              }}
            />
          )}

          {data && detail && (
            <section
              aria-labelledby="chat-app-choose"
              className="space-y-3"
            >
              <p
                id="chat-app-choose"
                className="aptiv-eyebrow"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {binding ? "Switch or manage apps" : "Choose an app"}
              </p>
              <ChannelPicker
                channels={data.channels}
                binding={binding}
                value={current}
                onChange={setSelected}
              />
              <ChannelDetail
                key={current}
                ref={detailHeading}
                channel={detail}
                binding={binding}
                busy={busy}
                locked={locked}
                connecting={pending === "save"}
                onPauseCurrent={() =>
                  run(
                    () => teamsChatAPI.setEnabled(false),
                    `${currentMeta?.short ?? "Current app"} paused.`
                  )
                }
                onProgress={(overview) => {
                  void mutate(overview, { revalidate: false });
                  setUnverified(false);
                  setError("");
                  const channel = overview.channels.find(
                    (item) => item.id === current
                  );
                  setNotice(
                    channel?.pending_link
                      ? `A ${CHANNEL_META[current].short} account sent your code. Confirm it below.`
                      : `${CHANNEL_META[current].label} linked.`
                  );
                }}
                onConfirmLink={() =>
                  void run(
                    () => chatChannelsAPI.confirmLink(current),
                    `${CHANNEL_META[current].label} linked.`
                  )
                }
                onCancelLink={() =>
                  void run(
                    () => chatChannelsAPI.cancelLink(current),
                    "Link request discarded. Nothing was linked."
                  )
                }
                onConnectSelfChat={(chatId) =>
                  void run(
                    () => teamsChatAPI.connect(chatId),
                    "Connected. Teams self-chat is on."
                  )
                }
                onManageToken={onManageToken}
              />
            </section>
          )}
        </div>
      </ScrollArea>
      <UnlinkDialog
        meta={unlinking ? CHANNEL_META[unlinking] : null}
        open={unlinking !== null}
        active={unlinking !== null && unlinking === activeChannel}
        onOpenChange={(open) => !open && setUnlinking(null)}
        onConfirm={() => {
          const channel = unlinking;
          setUnlinking(null);
          if (channel)
            void run(
              () => chatChannelsAPI.unlink(channel),
              `${CHANNEL_META[channel].label} unlinked.`
            );
        }}
      />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div
      aria-busy="true"
      className="space-y-3"
    >
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2
          aria-hidden="true"
          className="size-4 motion-safe:animate-spin"
        />
        Loading chat apps…
      </p>
      <div className="grid gap-2 @md/bots:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-16 rounded-lg border border-border bg-muted/50 @md/bots:h-24 motion-safe:animate-pulse"
          />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-border bg-muted/40 motion-safe:animate-pulse" />
    </div>
  );
}
