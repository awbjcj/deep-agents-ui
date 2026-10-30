"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatChannelsAPI,
  hasLinkProgress,
  linkDeadline,
  type ChannelId,
  type ChannelOverview,
  type LinkCode,
} from "@/lib/chat-channels";

export type LinkPhase = "idle" | "issuing" | "waiting" | "expired";
const POLL_MS = 3000;

/**
 * Issue a single-use link code, count down its lifetime, and poll until a chat
 * account redeems it (the owner then confirms that account). Polling pauses
 * while the tab is hidden and never overlaps; it stops on expiry, progress, or
 * unmount.
 */
export function useLinkCode(
  channel: ChannelId,
  onProgress: (overview: ChannelOverview) => void
) {
  const [phase, setPhase] = useState<LinkPhase>("idle");
  const [code, setCode] = useState<LinkCode | null>(null);
  const [term, setTerm] = useState({ start: 0, end: 0 });
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const progress = useRef(onProgress);
  useEffect(() => {
    progress.current = onProgress;
  });

  const issue = useCallback(async () => {
    setPhase("issuing");
    setError("");
    try {
      const next = await chatChannelsAPI.createLinkCode(channel);
      const received = Date.now();
      setCode(next);
      setTerm({ start: received, end: linkDeadline(next, received) });
      setNow(received);
      setPhase("waiting");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create a link code."
      );
      setCode(null);
      setPhase("idle");
    }
  }, [channel]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const tick = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= term.end) setPhase("expired");
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase, term.end]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const controller = new AbortController();
    let inFlight = false;
    const poll = window.setInterval(async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const overview = await chatChannelsAPI.overview(controller.signal);
        if (!controller.signal.aborted && hasLinkProgress(overview, channel)) {
          setCode(null);
          setPhase("idle");
          progress.current(overview);
        }
      } catch {
        // A transient read failure keeps waiting; the code is still valid.
      } finally {
        inFlight = false;
      }
    }, POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(poll);
    };
  }, [phase, channel]);

  const lifetime = Math.max(1, term.end - term.start);
  const remaining = Math.max(0, term.end - now);
  return {
    phase,
    code,
    error,
    issue,
    remaining,
    fraction: phase === "waiting" ? remaining / lifetime : 0,
  };
}

export function formatRemaining(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
