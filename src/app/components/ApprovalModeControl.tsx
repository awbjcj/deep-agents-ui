"use client";

import { useRef, useState } from "react";
import {
  BookOpenCheck,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  APPROVAL_MODES,
  APPROVAL_MODE_COPY,
  type ApprovalMode,
} from "@/lib/approval-modes";
import type { ApprovalModeState } from "@/app/hooks/useApprovalMode";

interface ApprovalModeControlProps {
  approvals: ApprovalModeState;
  ready: boolean;
  unavailableReason?: string;
}

const INSTANT = "!animate-none";
const PRESS_FEEDBACK =
  "[transition-timing-function:var(--ease-out)] active:scale-[0.97] active:translate-y-0 focus-visible:transform-none focus-visible:transition-none motion-reduce:transform-none";

const ICONS: Record<ApprovalMode, LucideIcon> = {
  interactive: ShieldCheck,
  allow_read: BookOpenCheck,
  autopilot: ShieldAlert,
};

const TRIGGER_TONE: Record<ApprovalMode, string> = {
  interactive: "border-transparent text-muted-foreground hover:text-foreground",
  allow_read:
    "border-primary/30 bg-primary/5 text-[var(--color-primary)] hover:bg-primary/10",
  autopilot:
    "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
};

const ITEM_TONE: Record<ApprovalMode, string> = {
  interactive: "bg-muted text-muted-foreground",
  allow_read: "bg-primary/10 text-[var(--color-primary)]",
  autopilot: "bg-destructive/10 text-destructive",
};

/**
 * Compact approval-mode picker for the composer.
 *
 * Interactive and Allow reads switch immediately; Autopilot opens an explicit
 * consent dialog. Background stops announce status without moving focus.
 */
export function ApprovalModeControl({
  approvals,
  ready,
  unavailableReason,
}: ApprovalModeControlProps) {
  const [consentOpen, setConsentOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // The consent dialog manages focus once the menu hands off to it; restoring
  // focus to the trigger first would read as an outside focus and dismiss it.
  const handingOff = useRef(false);
  const { mode, checking, error } = approvals;
  const copy = APPROVAL_MODE_COPY[mode];
  const Icon = checking ? Loader2 : ICONS[mode];

  function closeConsent() {
    approvals.cancel();
    setConsentOpen(false);
  }

  function choose(value: string) {
    const next = value as ApprovalMode;
    if (next === "autopilot") {
      handingOff.current = true;
      // Open after the selecting keystroke finishes; otherwise its Enter
      // activation lands on the dialog's focused button and dismisses it.
      window.setTimeout(() => setConsentOpen(true), 0);
    } else void approvals.select(next);
  }

  return (
    <Dialog
      open={consentOpen}
      onOpenChange={(next) => {
        if (!next) closeConsent();
        else setConsentOpen(true);
      }}
    >
      <div className="flex shrink-0 items-center">
        <Select
          value={mode}
          onValueChange={choose}
          disabled={mode === "interactive" && !ready}
        >
          <SelectTrigger
            ref={trigger}
            aria-label={`Approval mode: ${copy.label}`}
            title={
              error ||
              (mode === "interactive" && !ready
                ? unavailableReason
                : `${copy.label} · ${copy.summary}`)
            }
            className={cn(
              "h-9 w-auto gap-1.5 rounded-lg border px-2 text-xs shadow-none focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5",
              PRESS_FEEDBACK,
              error && mode === "interactive"
                ? "border-destructive/30 text-destructive"
                : TRIGGER_TONE[mode]
            )}
          >
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    checking && "motion-safe:animate-spin"
                  )}
                  aria-hidden="true"
                />
                <span className="hidden @[26rem]/composer:inline">
                  {copy.label}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            side="top"
            align="start"
            className={cn("w-72 rounded-xl p-0.5", INSTANT)}
            onCloseAutoFocus={(event) => {
              if (!handingOff.current) return;
              handingOff.current = false;
              event.preventDefault();
            }}
          >
            {APPROVAL_MODES.map((option) => {
              const ItemIcon = ICONS[option];
              const locked = option === "autopilot" && !approvals.canAutopilot;
              return (
                <SelectItem
                  key={option}
                  value={option}
                  textValue={APPROVAL_MODE_COPY[option].label}
                  disabled={
                    locked ||
                    (option !== "interactive" && option !== mode && !ready)
                  }
                  className="items-start gap-3 rounded-lg py-2 pl-8 pr-2 [&>span:first-child]:top-3"
                >
                  <span className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        ITEM_TONE[option]
                      )}
                      aria-hidden="true"
                    >
                      <ItemIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {APPROVAL_MODE_COPY[option].label}
                      </span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {locked
                          ? "Available to administrators and developers."
                          : APPROVAL_MODE_COPY[option].summary}
                      </span>
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <span
          role="status"
          className="sr-only"
        >
          {checking
            ? `Checking access for ${APPROVAL_MODE_COPY[checking].label}…`
            : copy.status}
        </span>
        {!consentOpen && error && (
          <span
            role="alert"
            className="sr-only"
          >
            {error}
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
          trigger.current?.focus({ preventScroll: true });
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
            conversation, including writes and subagents.
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
              Returns to Interactive when you leave, reload, sign out, or stop
              the run. Available to admins and developers; tool permissions
              still apply.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Prefer a safer default?</dt>
            <dd className="mt-0.5 text-muted-foreground">
              Allow reads approves searches and reads automatically but still
              asks before anything is written or sent.
            </dd>
          </div>
        </dl>
        {error && (
          <p
            role="alert"
            className="text-sm leading-5 text-destructive"
          >
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            className={cn("min-h-11", PRESS_FEEDBACK)}
            onClick={closeConsent}
          >
            {mode === "allow_read"
              ? "Keep Allow reads"
              : "Keep manual approval"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className={cn("min-h-11", PRESS_FEEDBACK)}
            disabled={checking === "autopilot" || !ready}
            onClick={async () => {
              if (await approvals.select("autopilot")) setConsentOpen(false);
            }}
          >
            {checking === "autopilot"
              ? "Checking access…"
              : "I understand, enable autopilot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
