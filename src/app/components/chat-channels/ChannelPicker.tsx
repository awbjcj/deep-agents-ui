"use client";

import type { ChannelId, ChatChannel } from "@/lib/chat-channels";
import type { TeamsBinding } from "@/lib/teams-chat";
import { cn } from "@/lib/utils";
import { CHANNEL_META, channelStatus } from "./channel-meta";
import { AppTile, StatusBadge } from "./StatusBadge";

/** Native radio group: arrow keys move between apps, Tab leaves the group. */
export function ChannelPicker({
  label,
  channels,
  binding,
  value,
  onChange,
}: {
  label: string;
  channels: ChatChannel[];
  binding: TeamsBinding | null;
  value: ChannelId;
  onChange: (channel: ChannelId) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
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
                "group bg-card fill-mode-both motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 relative flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-3 motion-safe:duration-300",
                "transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
                "has-focus-visible:ring-primary/25 has-focus-visible:ring-[3px]",
                "@md/bots:flex-col @md/bots:items-start @md/bots:gap-2",
                checked
                  ? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                  : "border-border [@media(hover:hover)]:hover:border-(--border-strong)"
              )}
            >
              <input
                type="radio"
                name="chat-app"
                value={channel.id}
                checked={checked}
                aria-label={meta.label}
                onChange={() => onChange(channel.id)}
                aria-describedby={statusId}
                className="sr-only"
              />
              <AppTile
                icon={meta.icon}
                selected={checked}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm leading-tight font-semibold">
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
