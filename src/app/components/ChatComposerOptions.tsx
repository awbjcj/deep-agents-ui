"use client";

import type { useAutopilot } from "@/app/hooks/useAutopilot";
import type { MessageDelivery } from "@/lib/message-delivery";
import { AutopilotControl } from "./AutopilotControl";
import { ResponseJobs } from "./ResponseJobs";

interface ChatComposerOptionsProps {
  id: string;
  open: boolean;
  autopilot?: ReturnType<typeof useAutopilot>;
  scope: string;
  ready: boolean;
  unavailableReason: string;
  threadId: string | null;
  delivery: MessageDelivery;
  isRunning: boolean;
}

/** Keep active automation visible; reveal other controls and help on demand. */
export function ChatComposerOptions({
  id,
  open,
  autopilot,
  scope,
  ready,
  unavailableReason,
  threadId,
  delivery,
  isRunning,
}: ChatComposerOptionsProps) {
  return (
    <div
      id={id}
      hidden={!open && !autopilot?.enabled && !autopilot?.error}
      className="border-t border-border/60 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {autopilot && (
          <AutopilotControl
            key={scope}
            autopilot={autopilot}
            ready={ready}
            unavailableReason={unavailableReason}
            onDisable={() => {
              if (!open) document.getElementById(`${id}-trigger`)?.focus();
            }}
          />
        )}
        <div hidden={!open}>
          <ResponseJobs
            key={threadId}
            threadId={threadId}
          />
        </div>
      </div>
      {open && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {isRunning
            ? `Enter to ${
                delivery === "queue" ? "queue" : "steer"
              } · Ctrl/⌘ Enter to ${delivery === "queue" ? "steer" : "queue"}`
            : "Enter to send"}
          {" · Shift Enter for a new line · Type $ for skills"}
        </p>
      )}
    </div>
  );
}
