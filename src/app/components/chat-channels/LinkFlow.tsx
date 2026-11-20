"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChannelOverview, ChatChannel } from "@/lib/chat-channels";
import { CHANNEL_META, type ChannelMeta } from "./channel-meta";
import { formatRemaining, useLinkCode } from "./useLinkCode";

/**
 * Guide one channel from "not linked" to linked: optionally pause the current
 * connection, issue a code, hand it to the chat app, and wait for the link.
 */
export function LinkFlow({
  channel,
  blocking,
  disabled,
  onPauseCurrent,
  onProgress,
}: {
  channel: ChatChannel;
  /** Another connection that must be turned off first. */
  blocking: ChannelMeta | null;
  disabled: boolean;
  onPauseCurrent: () => Promise<boolean>;
  /** A chat account redeemed the code; the overview now shows it. */
  onProgress: (overview: ChannelOverview) => void;
}) {
  const meta = CHANNEL_META[channel.id];
  const link = useLinkCode(channel.id, onProgress);
  const waiting = link.phase === "waiting";
  const showTicket = link.code && (waiting || link.phase === "expired");

  if (blocking && link.phase === "idle" && !link.code) {
    return (
      <div className="border-border bg-muted/40 space-y-3 rounded-lg border p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Info
            aria-hidden="true"
            className="text-brand-primary size-4"
          />
          {blocking.label} is on
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Linking {meta.label} turns {blocking.label} off and moves your VSDA
          conversation to {meta.short}. Tasks already running keep going and
          report to {meta.short}.
        </p>
        <Button
          className="min-h-11 w-full"
          disabled={disabled}
          onClick={async () => {
            if (await onPauseCurrent()) await link.issue();
          }}
        >
          Turn off {blocking.label} and continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!showTicket && <LinkSteps meta={meta} />}
      {showTicket && link.code && (
        <CodeTicket
          meta={meta}
          command={link.code.command}
          expired={link.phase === "expired"}
          remaining={link.remaining}
          fraction={link.fraction}
        />
      )}
      {link.error && (
        <p
          role="alert"
          className="border-error bg-error-secondary rounded-md border px-3 py-2 text-sm wrap-break-word"
        >
          {link.error}
        </p>
      )}
      {waiting && link.code ? (
        <>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {link.code.code_prefilled && link.code.open_url
              ? meta.sendPrefilled
              : meta.sendManual}
          </p>
          <div className="flex flex-col gap-2 @sm/bots:flex-row">
            {link.code.open_url && (
              <Button
                asChild
                className="min-h-11 flex-1"
              >
                <a
                  href={link.code.open_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {meta.open}
                  <ArrowUpRight aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              className="min-h-11"
              disabled={disabled}
              onClick={() => void link.issue()}
            >
              <RefreshCw aria-hidden="true" />
              New code
            </Button>
          </div>
          <p
            role="status"
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <Loader2
              aria-hidden="true"
              className="size-4 motion-safe:animate-spin"
            />
            Waiting for your message in {meta.short}…
          </p>
        </>
      ) : (
        <Button
          className="min-h-11 w-full"
          disabled={disabled || link.phase === "issuing"}
          onClick={() => void link.issue()}
        >
          {link.phase === "issuing" && (
            <Loader2
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          )}
          {link.phase === "issuing"
            ? "Creating code…"
            : link.phase === "expired"
              ? "Get a new code"
              : "Get link code"}
        </Button>
      )}
    </div>
  );
}

function LinkSteps({ meta }: { meta: ChannelMeta }) {
  const steps = [
    "Get a one-time link code. It works once and expires in 5 minutes.",
    `Send it to the VSDA bot in ${meta.short}.`,
    "Confirm your account here to finish linking.",
  ];
  return (
    <ol className="list-none space-y-2 pl-0">
      {steps.map((step, index) => (
        <li
          key={step}
          className="flex gap-3 text-sm leading-relaxed"
        >
          <span
            aria-hidden="true"
            className="border-border bg-muted text-xxs flex size-6 shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums"
          >
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function CodeTicket({
  meta,
  command,
  expired,
  remaining,
  fraction,
}: {
  meta: ChannelMeta;
  command: string;
  expired: boolean;
  remaining: number;
  fraction: number;
}) {
  const [copied, setCopied] = useState(false);
  const reset = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(reset.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.clearTimeout(reset.current);
      reset.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 rounded-lg border p-3 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xxs text-muted-foreground font-semibold tracking-wide uppercase">
          {expired ? "Code expired" : `Send this in ${meta.short}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9"
          disabled={expired}
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> link command</span>
        </Button>
      </div>
      <code
        className={
          "border-border bg-card mt-2 block rounded-md border px-3 py-2 font-mono text-sm break-all select-all " +
          (expired ? "text-muted-foreground line-through" : "text-foreground")
        }
      >
        {command}
      </code>
      <div className="mt-3 flex items-center gap-3">
        <div
          aria-hidden="true"
          className="bg-border h-1 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-1000 motion-safe:ease-linear"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
        <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {expired ? "Expired" : `Expires in ${formatRemaining(remaining)}`}
        </p>
      </div>
      <p
        aria-live="polite"
        className="sr-only"
      >
        {copied
          ? "Link command copied."
          : expired
            ? "The link code expired."
            : ""}
      </p>
    </div>
  );
}
