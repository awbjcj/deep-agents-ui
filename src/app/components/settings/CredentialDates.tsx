"use client";

import type { useCredentialDates } from "@/app/hooks/useCredentialDates";

function duration(minutes: number) {
  if (minutes < 1) return "<1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, mins && `${mins}m`]
    .filter(Boolean)
    .join(" ");
}

export function CredentialDates({
  now,
  updated,
  expires,
  expired,
}: ReturnType<typeof useCredentialDates>) {
  if (!Number.isFinite(updated) && !Number.isFinite(expires)) return null;
  const updatedAge = Math.max(0, Math.floor((now - updated) / 60_000));
  const expiryGap = duration(Math.floor(Math.abs(expires - now) / 60_000));
  return (
    <span className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-normal tabular-nums">
      {Number.isFinite(updated) && (
        <time
          dateTime={new Date(updated).toISOString()}
          title={new Date(updated).toLocaleString()}
        >
          Updated {updatedAge ? `${duration(updatedAge)} ago` : "just now"}
        </time>
      )}
      {Number.isFinite(expires) && (
        <time
          dateTime={new Date(expires).toISOString()}
          title={new Date(expires).toLocaleString()}
          className={expired ? "text-destructive" : undefined}
        >
          {expired ? "Expired for " : "Expires in "}
          {expiryGap} ({new Date(expires).toLocaleDateString()})
        </time>
      )}
    </span>
  );
}
