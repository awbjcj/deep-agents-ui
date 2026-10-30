"use client";

import type { ChannelId, ChatChannel } from "@/lib/chat-channels";
import type { TeamsBinding } from "@/lib/teams-chat";
import { cn } from "@/lib/utils";
import { CHANNEL_META, channelStatus } from "./channel-meta";
import { AppTile, StatusBadge } from "./StatusBadge";

/** Native radio group: arrow keys move between apps, Tab leaves the group. */
export function ChannelPicker({
  channels,
  binding,
  value,
  onChange,
}: {
  channels: ChatChannel[];
  binding: TeamsBinding | null;
  value: ChannelId;
  onChange: (channel: ChannelId) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Chat app</legend>
      <div className="grid gap-2 @md/bots:grid-cols-3">
        {channels.map((channel, index) => {
          const meta = CHANNEL_META[channel.id];
          const checked = value === channel.id;
          const statusId = `chat-app-${channel.id}-status`;
          return (
            <label
              key={channel.id}
              style={{ animationDelay: `${index * 50}ms` }}
              className={cn(
                "group relative flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 [animation-fill-mode:both] motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1",
                "transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
                "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-primary/25",
                "@md/bots:flex-col @md/bots:items-start @md/bots:gap-2",
                checked
                  ? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                  : "border-border [@media(hover:hover)]:hover:border-[var(--border-strong)]"
              )}
            >
              <input
                type="radio"
                name="chat-app"
                value={channel.id}
                checked={checked}
                onChange={() => onChange(channel.id)}
                aria-describedby={statusId}
                className="sr-only"
              />
              <AppTile
                icon={meta.icon}
                selected={checked}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold leading-tight">
                  {meta.label}
                </span>
                <StatusBadge
                  id={statusId}
                  className="self-start"
                  status={channelStatus(channel, binding)}
                />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
