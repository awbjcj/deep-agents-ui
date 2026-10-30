"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Bot,
  Info,
  MessageCircleQuestion,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { chatHref } from "@/lib/chat-links";
import type { ChatChannel } from "@/lib/chat-channels";
import type { TeamsBinding } from "@/lib/teams-chat";
import {
  channelStatus,
  metaForTransport,
  type ChannelStatus,
} from "./channel-meta";
import { AppTile, StatusBadge } from "./StatusBadge";

/** The account's one live connection, in any transport, and its controls. */
export function ActiveConnection({
  binding,
  channel,
  busy,
  locked,
  onToggle,
  onInteractive,
  onUnlink,
  onRelink,
}: {
  binding: TeamsBinding;
  /** The bot channel behind this binding; null for Teams self-chat. */
  channel: ChatChannel | null;
  busy: boolean;
  /** Saved state is unverified; writes stay disabled until a read succeeds. */
  locked: boolean;
  onToggle: (enabled: boolean) => void;
  onInteractive: () => void;
  onUnlink: () => void;
  onRelink: () => void;
}) {
  const meta = metaForTransport(binding.transport);
  const linked = channel ? channel.linked : true;
  const status: ChannelStatus =
    channel && !channel.linked
      ? { tone: "unavailable", label: "Unlinked" }
      : channel
      ? channelStatus(channel, binding)
      : binding.needs_reconnect
      ? { tone: "attention", label: "Needs reconnect" }
      : binding.enabled
      ? { tone: "active", label: "Active" }
      : { tone: "paused", label: "Paused" };
  const showSwitch = linked && !binding.needs_reconnect;
  const state = locked
    ? "Status unknown · refresh to confirm"
    : binding.enabled
    ? binding.worker_enabled
      ? "On · listening for your requests"
      : "On · waiting for service availability"
    : "Off · messages are paused";

  return (
    <section
      aria-labelledby="chat-app-active-title"
      className="overflow-hidden rounded-xl border border-border bg-card shadow-xs motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
    >
      <div className="flex items-start gap-3 p-4">
        <AppTile
          icon={meta.icon}
          selected={binding.enabled && linked}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-xxs font-semibold uppercase tracking-wide text-muted-foreground">
              Your connected app
            </p>
            <StatusBadge status={status} />
          </div>
          <h3
            id="chat-app-active-title"
            className="mt-0.5 text-base font-semibold leading-tight"
          >
            {meta.label}
          </h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {channel?.linked_account
              ? `${channel.linked_account} · ${meta.place}`
              : meta.place}
          </p>
        </div>
      </div>

      {showSwitch && (
        <>
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="chat-app-enabled"
                className="text-sm font-semibold"
              >
                Enable {meta.short}
              </Label>
              <p
                id="chat-app-enabled-state"
                className="text-sm text-muted-foreground"
              >
                {state}
              </p>
            </div>
            <Switch
              id="chat-app-enabled"
              checked={binding.enabled}
              disabled={
                busy || locked || (!binding.worker_enabled && !binding.enabled)
              }
              aria-describedby="chat-app-enabled-state chat-app-enabled-help"
              className="h-6 w-11 data-[state=unchecked]:bg-foreground/50 motion-reduce:transition-none [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-[22px] [&_[data-slot=switch-thumb]]:motion-reduce:transition-none"
              onCheckedChange={onToggle}
            />
          </div>
          <p
            id="chat-app-enabled-help"
            className="border-t border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
          >
            Turning this off pauses requests and replies. A task already running
            continues; open the conversation to stop it.
          </p>
        </>
      )}

      <div className="space-y-2 border-t border-border p-4 empty:hidden">
        {binding.needs_reconnect && (
          <Notice
            tone="attention"
            title={`${meta.label} needs to be linked again`}
            action={
              <Button
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={onRelink}
              >
                {channel ? "Link again" : "Reconnect"}
              </Button>
            }
          >
            {binding.last_error}
          </Notice>
        )}
        {!binding.needs_reconnect && !linked && (
          <Notice title={`${meta.label} was unlinked`}>
            Choose an app below and link it to continue.
          </Notice>
        )}
        {!binding.needs_reconnect && linked && binding.last_error && (
          <Notice
            tone="attention"
            title="Connection needs attention"
          >
            {binding.last_error}
          </Notice>
        )}
        {!binding.worker_enabled && (
          <Notice title={`${meta.short} is unavailable on this server`}>
            Ask an administrator to enable it. Your preference is saved
            {binding.enabled ? " and takes effect when it is available" : ""}.
          </Notice>
        )}
        {binding.mode === "autopilot" && !binding.needs_reconnect && (
          <Notice
            icon={Bot}
            title="Autopilot is selected"
            action={
              <Button
                variant="outline"
                className="min-h-11"
                disabled={busy || locked}
                onClick={onInteractive}
              >
                Use Interactive mode
              </Button>
            }
          >
            Eligible actions can be approved automatically. Switch to
            Interactive to review them yourself.
          </Notice>
        )}
        {binding.review && !binding.needs_reconnect && (
          <Notice
            icon={MessageCircleQuestion}
            title="A review is waiting"
          >
            Answer it in {meta.short} or open the conversation.
          </Notice>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        <Button
          asChild
          variant="outline"
          className="min-h-11 flex-1"
        >
          <Link href={chatHref(binding.thread_id)}>
            Open conversation
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
        {channel?.linked && (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={busy || locked}
            onClick={onUnlink}
          >
            <Unlink aria-hidden="true" />
            Unlink
          </Button>
        )}
      </div>
      <details className="border-t border-border px-4 text-sm">
        <summary className="cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          Connection details
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 pb-4">
          {linked && (
            <>
              <dt className="text-muted-foreground">Conversation</dt>
              <dd className="break-all font-mono text-xs">{binding.chat_id}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Execution mode</dt>
          <dd>
            {binding.mode === "interactive"
              ? "Interactive · you review actions"
              : "Autopilot"}
          </dd>
        </dl>
      </details>
    </section>
  );
}

function Notice({
  title,
  children,
  action,
  tone = "info",
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "info" | "attention";
  icon?: typeof Info;
}) {
  const Icon = icon ?? (tone === "attention" ? TriangleAlert : Info);
  return (
    <div
      className={
        "flex gap-3 rounded-lg border p-3 text-sm " +
        (tone === "attention"
          ? "border-warning bg-warning-secondary"
          : "border-border bg-muted/40")
      }
    >
      <Icon
        aria-hidden="true"
        className={
          "mt-0.5 size-4 shrink-0 " +
          (tone === "attention" ? "text-warning" : "text-brand-primary")
        }
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold">{title}</p>
        {children && (
          <p className="break-words leading-relaxed text-muted-foreground">
            {children}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}
