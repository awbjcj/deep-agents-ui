"use client";

import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatChannel } from "@/lib/chat-channels";
import { CHANNEL_META } from "./channel-meta";

/**
 * The second half of linking: a chat account redeemed this user's code, and
 * only the signed-in owner can accept it. Showing the exact external account
 * protects against a leaked or shared code linking someone else's chat.
 */
export function ConfirmLink({
  channel,
  disabled,
  onConfirm,
  onCancel,
}: {
  channel: ChatChannel;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = CHANNEL_META[channel.id];
  const pending = channel.pending_link;
  if (!pending) return null;
  const expires = new Date(pending.expires_at * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div
      role="group"
      aria-labelledby={`chat-app-${channel.id}-confirm`}
      className="space-y-4 rounded-lg border border-brand-subtle bg-brand-tertiary p-4 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
    >
      <div className="flex gap-3">
        <UserCheck
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-brand-primary"
        />
        <div className="min-w-0 space-y-1 text-sm">
          <p
            id={`chat-app-${channel.id}-confirm`}
            className="font-semibold"
          >
            Is this your {meta.short} account?
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {pending.display_name && (
              <>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="break-all font-medium">
                  {pending.display_name}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">{meta.short} ID</dt>
            <dd className="break-all font-mono text-xs leading-5">
              {pending.external_user_id}
            </dd>
          </dl>
          <p className="pt-1 leading-relaxed text-muted-foreground">
            This account sent your link code. Linking moves your VSDA
            conversation to it. If you do not recognize it, choose{" "}
            <span className="font-medium text-foreground">Not mine</span>;
            nothing is linked until you confirm. This request expires at{" "}
            {expires}.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 @sm/bots:flex-row">
        <Button
          className="min-h-11 flex-1"
          disabled={disabled}
          onClick={onConfirm}
        >
          Link this account
        </Button>
        <Button
          variant="outline"
          className="min-h-11 flex-1"
          disabled={disabled}
          onClick={onCancel}
        >
          Not mine
        </Button>
      </div>
    </div>
  );
}
