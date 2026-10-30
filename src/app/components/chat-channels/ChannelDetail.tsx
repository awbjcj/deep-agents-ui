"use client";

import { forwardRef, useState } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  CircleSlash,
  KeyRound,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CHANNEL_TRANSPORT,
  type ChannelOverview,
  type ChatChannel,
} from "@/lib/chat-channels";
import type { TeamsBinding } from "@/lib/teams-chat";
import { TeamsChatSetup } from "../teams-chat/TeamsChatSetup";
import { CHANNEL_META, metaForTransport } from "./channel-meta";
import { ConfirmLink } from "./ConfirmLink";
import { LinkFlow } from "./LinkFlow";
import { AppTile } from "./StatusBadge";

interface ChannelDetailProps {
  channel: ChatChannel;
  binding: TeamsBinding | null;
  busy: boolean;
  locked: boolean;
  connecting: boolean;
  onPauseCurrent: () => Promise<boolean>;
  onProgress: (overview: ChannelOverview) => void;
  onConfirmLink: () => void;
  onCancelLink: () => void;
  onConnectSelfChat: (chatId: string) => void;
  onManageToken: () => void;
}

/** What the selected app offers and the one next step for this account. */
export const ChannelDetail = forwardRef<HTMLHeadingElement, ChannelDetailProps>(
  function ChannelDetail(props, headingRef) {
    const { channel, binding } = props;
    const meta = CHANNEL_META[channel.id];
    const active = binding?.transport === CHANNEL_TRANSPORT[channel.id];
    const usable = active && channel.linked && !binding?.needs_reconnect;
    const [relinking, setRelinking] = useState(false);
    const blocking =
      binding?.enabled && !usable ? metaForTransport(binding.transport) : null;
    const titleId = `chat-app-${channel.id}-title`;

    let body;
    if (!channel.available) {
      body = <Unavailable channel={channel} />;
    } else if (channel.pending_link) {
      body = (
        <ConfirmLink
          channel={channel}
          disabled={props.busy || props.locked}
          onConfirm={props.onConfirmLink}
          onCancel={props.onCancelLink}
        />
      );
    } else if (usable && binding?.enabled) {
      body = <Connected channel={channel} />;
    } else if (usable && !relinking) {
      body = (
        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            {meta.label} is paused. Turn it on above to resume, or link a
            different {meta.short} account.
          </p>
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={props.busy || props.locked}
            onClick={() => setRelinking(true)}
          >
            Link a different account
          </Button>
        </div>
      );
    } else {
      body = (
        <LinkFlow
          channel={channel}
          blocking={blocking}
          disabled={props.busy || props.locked}
          onPauseCurrent={props.onPauseCurrent}
          onProgress={props.onProgress}
        />
      );
    }

    return (
      <section
        aria-labelledby={titleId}
        className="overflow-hidden rounded-xl border border-border bg-card motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <AppTile icon={meta.icon} />
          <div className="min-w-0 flex-1">
            <h3
              ref={headingRef}
              id={titleId}
              tabIndex={-1}
              className="text-base font-semibold leading-tight focus:outline-none"
            >
              {meta.label}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{meta.place}</p>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
            <ListChecks
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              <span className="font-medium text-foreground">Reviews: </span>
              {meta.reviews}
            </span>
          </p>
          {body}
        </div>
        {channel.id === "teams" && <SelfChatOption {...props} />}
      </section>
    );
  }
);

function Unavailable({ channel }: { channel: ChatChannel }) {
  const meta = CHANNEL_META[channel.id];
  // Only administrators receive the blocking setting names.
  const operator = channel.missing_settings.length > 0;
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <CircleSlash
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        {meta.label} is not set up on this server
      </p>
      <p className="leading-relaxed text-muted-foreground">
        {operator
          ? `Set these server settings and restart the backend. Users can then link ${meta.short} here.`
          : "Ask an administrator to enable it. Once it is available, you can link it here in under a minute."}
      </p>
      {operator && (
        <div className="space-y-2">
          <p className="font-medium">Missing server settings</p>
          <ul className="flex list-none flex-wrap gap-1.5 pl-0">
            {channel.missing_settings.map((name) => (
              <li
                key={name}
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            See{" "}
            <span className="font-mono text-xs">
              docs/agent/chat-bot-channels.md
            </span>{" "}
            in the backend repository.
          </p>
        </div>
      )}
    </div>
  );
}

function Connected({ channel }: { channel: ChatChannel }) {
  const meta = CHANNEL_META[channel.id];
  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-lg border border-success bg-success-secondary p-4 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
        <CircleCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-success"
        />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{meta.label} is connected</p>
          <p className="leading-relaxed text-muted-foreground">
            Send a task to the VSDA bot in {meta.short}. Progress, results, and
            reviews arrive there.
          </p>
        </div>
      </div>
      {channel.bot_url && (
        <Button
          asChild
          variant="outline"
          className="min-h-11 w-full"
        >
          <a
            href={channel.bot_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {meta.open}
            <ArrowUpRight aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Button>
      )}
    </div>
  );
}

function SelfChatOption({
  binding,
  busy,
  locked,
  connecting,
  onConnectSelfChat,
  onManageToken,
}: ChannelDetailProps) {
  const selfChat = binding?.transport === "graph";
  const otherOn = Boolean(binding?.enabled && !selfChat);
  const mustReconnect = Boolean(selfChat && binding?.needs_reconnect);
  return (
    <details
      open={mustReconnect || undefined}
      className="group border-t border-border text-sm"
    >
      <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        Prefer your Teams self-chat?
      </summary>
      <div className="space-y-4 px-4 pb-4">
        <p className="leading-relaxed text-muted-foreground">
          Use your private chat with yourself instead of a bot. It needs your
          Microsoft Graph token, uses <code className="font-mono">/agent</code>{" "}
          text commands, and opens reviews in the web conversation.
        </p>
        {selfChat && !binding?.needs_reconnect ? (
          <p className="font-medium">
            {binding?.enabled
              ? "Your Teams self-chat is connected."
              : "Your Teams self-chat is paused. Turn it on above to resume."}
          </p>
        ) : otherOn ? (
          <p className="text-muted-foreground">
            Turn off your current app above before connecting your self-chat.
          </p>
        ) : (
          <TeamsChatSetup
            busy={busy || locked}
            connecting={connecting}
            reconnecting={mustReconnect}
            onConnect={onConnectSelfChat}
          />
        )}
        <Button
          variant="ghost"
          className="min-h-11 w-full justify-start px-2"
          onClick={onManageToken}
        >
          <KeyRound aria-hidden="true" />
          Manage Microsoft Graph token
        </Button>
      </div>
    </details>
  );
}
