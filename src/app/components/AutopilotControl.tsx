"use client";

import { useRef, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { useAutopilot } from "@/app/hooks/useAutopilot";

interface AutopilotControlProps {
  autopilot: ReturnType<typeof useAutopilot>;
  ready: boolean;
  unavailableReason?: string;
}

const INSTANT = "!animate-none";
const PRESS_FEEDBACK =
  "[transition-timing-function:var(--ease-out)] active:scale-[0.97] active:translate-y-0 focus-visible:transform-none focus-visible:transition-none motion-reduce:transform-none";

/** Keep opt-out visible without moving focus when automation stops in the background. */
export function AutopilotControl({
  autopilot,
  ready,
  unavailableReason,
}: AutopilotControlProps) {
  const [open, setOpen] = useState(false);
  const actionButton = useRef<HTMLButtonElement>(null);
  const enabled = autopilot.enabled;
  const Icon = enabled || autopilot.error ? ShieldAlert : ShieldCheck;

  function closeDialog() {
    autopilot.disable();
    setOpen(false);
  }

  if (!autopilot.eligible) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
        else setOpen(true);
      }}
    >
      <div className="flex shrink-0 items-center">
        <Button
          ref={actionButton}
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-lg border px-2 text-xs",
            PRESS_FEEDBACK,
            enabled
              ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
              : autopilot.error
              ? "border-destructive/30 text-destructive"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          disabled={!enabled && !ready}
          aria-label={enabled ? "Turn off autopilot" : "Enable autopilot"}
          aria-pressed={enabled}
          aria-haspopup={enabled ? undefined : "dialog"}
          title={
            autopilot.error ||
            (!enabled && !ready
              ? unavailableReason
              : enabled
              ? "Autopilot on · approves actions automatically. Click to turn off."
              : "Autopilot off · you approve each action. Click to enable.")
          }
          onClick={() => {
            if (enabled) {
              autopilot.disable();
            } else setOpen(true);
          }}
        >
          <Icon
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="hidden @[26rem]/composer:inline">Autopilot</span>
          <span className="font-normal opacity-80">
            {enabled ? "On" : "Off"}
          </span>
        </Button>
        <span
          role="status"
          className="sr-only"
        >
          {enabled
            ? "Autopilot on. Actions are approved automatically."
            : "Autopilot off. Manual approval."}
        </span>
        {!open && autopilot.error && (
          <span
            role="alert"
            className="sr-only"
          >
            {autopilot.error}
          </span>
        )}
      </div>

      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-2xl p-5 sm:p-6 [&_p]:!mb-0",
          INSTANT
        )}
        overlayClassName={INSTANT}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          actionButton.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="text-left">
          <div
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive"
            aria-hidden="true"
          >
            <ShieldAlert className="h-5 w-5" />
          </div>
          <DialogTitle>Enable autopilot?</DialogTitle>
          <DialogDescription>
            Automatically approve pending and future requests in this
            conversation, including subagents.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm leading-6">
          <p className="font-semibold text-destructive">This is dangerous.</p>
          <p className="mt-1">
            The agent can send messages, change external data, and trigger
            builds without asking. Actions may be irreversible.
          </p>
        </div>
        <dl className="space-y-3 text-sm leading-5">
          <div>
            <dt className="font-medium">This chat only</dt>
            <dd className="mt-0.5 text-muted-foreground">
              Turns off when you leave, reload, sign out, or stop the run.
              Available to admins and developers; tool permissions still apply.
            </dd>
          </div>
          <div>
            <dt className="font-medium">You can turn it off anytime</dt>
            <dd className="mt-0.5 text-muted-foreground">
              New requests return to manual review. Already approved actions may
              still finish.
            </dd>
          </div>
        </dl>
        {autopilot.error && (
          <p
            role="alert"
            className="text-sm leading-5 text-destructive"
          >
            {autopilot.error}
          </p>
        )}
        <DialogFooter className="gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            className={cn("min-h-11", PRESS_FEEDBACK)}
            onClick={closeDialog}
          >
            Keep manual approval
          </Button>
          <Button
            type="button"
            variant="destructive"
            className={cn("min-h-11", PRESS_FEEDBACK)}
            disabled={autopilot.checking || !ready}
            onClick={async () => {
              if (await autopilot.enable()) setOpen(false);
            }}
          >
            {autopilot.checking
              ? "Checking access…"
              : "I understand, enable autopilot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
