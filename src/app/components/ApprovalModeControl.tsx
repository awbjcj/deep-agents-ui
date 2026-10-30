"use client";

import { Fragment, useRef, useState } from "react";
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
  SelectSeparator,
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
import {
  COMPOSER_OPTION_ROW,
  COMPOSER_TRIGGER,
  ComposerMenuOption,
  OPTION_TILE_TONE,
  PRESS_FEEDBACK,
  TRIGGER_TONE,
} from "./ComposerMenuOption";

interface ApprovalModeControlProps {
  approvals: ApprovalModeState;
  ready: boolean;
  unavailableReason?: string;
}

const INSTANT = "!animate-none";

const ICONS: Record<ApprovalMode, LucideIcon> = {
  interactive: ShieldCheck,
  allow_read: BookOpenCheck,
  autopilot: ShieldAlert,
};

const TONE = {
  interactive: "neutral",
  allow_read: "primary",
  autopilot: "destructive",
} as const satisfies Record<ApprovalMode, keyof typeof TRIGGER_TONE>;

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
              COMPOSER_TRIGGER,
              TRIGGER_TONE[
                error && mode === "interactive" ? "destructive" : TONE[mode]
              ]
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
            className={cn("w-72 rounded-xl", INSTANT)}
            onCloseAutoFocus={(event) => {
              if (!handingOff.current) return;
              handingOff.current = false;
              event.preventDefault();
            }}
          >
            {APPROVAL_MODES.map((option) => {
              const locked = option === "autopilot" && !approvals.canAutopilot;
              return (
                <Fragment key={option}>
                  {option === "autopilot" && (
                    <SelectSeparator className="my-1 bg-border/70" />
                  )}
                  <SelectItem
                    value={option}
                    textValue={APPROVAL_MODE_COPY[option].label}
                    indicator={false}
                    disabled={
                      locked ||
                      (option !== "interactive" && option !== mode && !ready)
                    }
                    className={COMPOSER_OPTION_ROW}
                  >
                    <ComposerMenuOption
                      icon={ICONS[option]}
                      label={APPROVAL_MODE_COPY[option].label}
                      summary={
                        locked
                          ? "Available to administrators and developers."
                          : APPROVAL_MODE_COPY[option].summary
                      }
                      tileClassName={OPTION_TILE_TONE[TONE[option]]}
                    />
                  </SelectItem>
                </Fragment>
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
