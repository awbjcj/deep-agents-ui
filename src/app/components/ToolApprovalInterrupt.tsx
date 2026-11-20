"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldAlert,
  Check,
  X,
  Pencil,
  ChevronDown,
  CheckCircle2,
  XCircle,
  PencilLine,
} from "lucide-react";
import type {
  ActionRequest,
  HumanDecision,
  ResumeInterruptValue,
  ReviewConfig,
} from "@/app/types/types";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/app/components/MarkdownContent";

import { ApprovalArgumentEditor } from "./ApprovalArgumentEditor";
import { argumentDrafts, parseArgumentDrafts } from "@/lib/approval-fields";

interface ToolApprovalInterruptProps {
  actionRequest: ActionRequest;
  reviewConfig?: ReviewConfig;
  onResume?: (value: ResumeInterruptValue) => void;
  onDecisionChange?: (decision: HumanDecision) => void;
  currentDecision?: HumanDecision;
  isLoading?: boolean;
  /** Rendered inside a batch review, which already frames and titles the group. */
  embedded?: boolean;
}

const SECTION_LABEL =
  "text-xxs font-semibold uppercase tracking-wide text-muted-foreground";

const DESCRIPTION_PROSE_OVERRIDES =
  "text-sm leading-6 [&_p]:mb-2! [&_p:last-child]:mb-0! [&_ul]:my-2! [&_ol]:my-2! " +
  "[&_pre]:my-2! [&_pre]:rounded-md! [&_h1]:text-base! [&_h2]:text-sm! [&_h3]:text-sm! " +
  "[&_h1]:mt-0! [&_h2]:mt-0! [&_h3]:mt-0! [&_h1]:mb-2! [&_h2]:mb-2! [&_h3]:mb-2!";

export function ToolApprovalInterrupt({
  actionRequest,
  reviewConfig,
  onResume,
  onDecisionChange,
  currentDecision,
  isLoading,
  embedded = false,
}: ToolApprovalInterruptProps) {
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [mode, setMode] = useState<"review" | "edit" | "reject">("review");
  const isEditing = mode === "edit";
  const showRejectionInput = mode === "reject";
  const previousMode = useRef(mode);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const rejectTrigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const rejectionNote = useRef<HTMLTextAreaElement>(null);
  const argumentSection = useRef<HTMLElement>(null);
  const fieldPrefix = useId();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { args: editedArgs, errors: fieldErrors } = useMemo(
    () => parseArgumentDrafts(actionRequest.args, drafts),
    [actionRequest.args, drafts]
  );
  const hasErrors = Object.keys(fieldErrors).length > 0;
  const [argsExpanded, setArgsExpanded] = useState(true);

  const allowedDecisions = reviewConfig?.allowedDecisions ?? [
    "approve",
    "reject",
    "edit",
  ];

  useLayoutEffect(() => {
    const from = previousMode.current;
    if (mode === from) return;
    previousMode.current = mode;
    if (mode === "edit") {
      const firstField = argumentSection.current?.querySelector<HTMLElement>(
        "textarea:not(:disabled), select:not(:disabled)"
      );
      (firstField ?? cancelButton.current)?.focus();
    } else if (mode === "reject") {
      rejectionNote.current?.focus();
    } else {
      (from === "edit" ? editTrigger : rejectTrigger).current?.focus();
    }
  }, [mode]);

  const reviewArgs =
    currentDecision?.type === "edit"
      ? currentDecision.edited_action.args
      : actionRequest.args;
  const argFieldCount = Object.keys(reviewArgs).length;
  const argsAsJson = useMemo(
    () => JSON.stringify(reviewArgs, null, 2),
    [reviewArgs]
  );
  const argsId = fieldPrefix + "-arguments";
  const noteId = fieldPrefix + "-rejection";

  const decisionBanner = useMemo(() => {
    if (!currentDecision) {
      return null;
    }

    switch (currentDecision.type) {
      case "approve":
        return {
          tone: "success" as const,
          icon: CheckCircle2,
          label: "Marked for approval",
        };
      case "reject":
        return {
          tone: "danger" as const,
          icon: XCircle,
          label: currentDecision.message?.trim()
            ? "Marked for rejection · note attached"
            : "Marked for rejection",
        };
      case "edit":
        return {
          tone: "neutral" as const,
          icon: PencilLine,
          label: "Edited action queued",
        };
      default:
        return null;
    }
  }, [currentDecision]);

  const emitDecision = (decision: HumanDecision) => {
    if (isLoading || !allowedDecisions.includes(decision.type)) return;
    if (onDecisionChange) {
      onDecisionChange(decision);
      return;
    }

    onResume?.({ decisions: [decision] });
  };

  const handleApprove = () => {
    emitDecision({ type: "approve" });
  };

  const handleReject = () => {
    setRejectionMessage(
      currentDecision?.type === "reject" ? (currentDecision.message ?? "") : ""
    );
    setMode("reject");
  };

  const handleRejectConfirm = () => {
    emitDecision({
      type: "reject",
      message: rejectionMessage.trim() || undefined,
    });
    setMode("review");
  };

  const handleEdit = () => {
    if (
      isEditing &&
      !hasErrors &&
      !isLoading &&
      allowedDecisions.includes("edit")
    ) {
      emitDecision({
        type: "edit",
        edited_action: {
          name: actionRequest.name,
          args: editedArgs,
        },
      });
      setMode("review");
    }
  };

  const startEditing = () => {
    setMode("edit");
    setDrafts(
      argumentDrafts(
        currentDecision?.type === "edit"
          ? currentDecision.edited_action.args
          : actionRequest.args
      )
    );
  };

  const cancelEditing = () => {
    setMode("review");
    setDrafts({});
  };

  const showDecision = decisionBanner && !isEditing && !showRejectionInput;
  const DecisionIcon = decisionBanner?.icon;

  return (
    <article
      aria-label={`Approval for ${actionRequest.name}`}
      className={cn(
        "text-foreground w-full min-w-0 rounded-xl border p-3 sm:p-4",
        embedded ? "border-border bg-background" : "border-warning bg-card"
      )}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {!embedded && (
            <span
              aria-hidden="true"
              className="bg-warning-primary text-warning mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              <ShieldAlert
                size={15}
                strokeWidth={2.25}
              />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            {!embedded && (
              <span className="text-sm leading-5 font-semibold">
                Approval required
              </span>
            )}
            <code
              className={cn(
                "w-fit max-w-full min-w-0 font-mono wrap-anywhere wrap-break-word",
                embedded
                  ? "text-foreground text-sm font-semibold"
                  : "text-muted-foreground text-xs"
              )}
            >
              {actionRequest.name}
            </code>
          </div>
        </div>
        <div
          role="status"
          aria-atomic="true"
          className="shrink-0"
        >
          {showDecision && DecisionIcon ? (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                decisionBanner.tone === "success" &&
                  "border-success bg-success-primary text-success",
                decisionBanner.tone === "danger" &&
                  "border-error bg-error-primary text-error",
                decisionBanner.tone === "neutral" &&
                  "border-border bg-muted text-muted-foreground"
              )}
            >
              <DecisionIcon
                aria-hidden="true"
                size={13}
              />
              {decisionBanner.label}
            </span>
          ) : null}
        </div>
      </header>

      {actionRequest.description ? (
        <div className="text-foreground mb-3 wrap-break-word">
          <MarkdownContent
            content={actionRequest.description}
            className={DESCRIPTION_PROSE_OVERRIDES}
          />
        </div>
      ) : null}

      <section
        ref={argumentSection}
        className="border-border bg-muted/30 min-w-0 overflow-hidden rounded-lg border"
      >
        <header
          className={cn(
            "min-h-touch flex items-center justify-between gap-2 px-3",
            (isEditing || (argFieldCount > 0 && argsExpanded)) &&
              "border-border border-b"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className={SECTION_LABEL}>
              {isEditing
                ? "Edit arguments"
                : currentDecision?.type === "edit"
                  ? "Edited arguments"
                  : "Arguments"}
            </span>
            <span className="text-xxs text-muted-foreground font-mono">
              {argFieldCount} field{argFieldCount === 1 ? "" : "s"}
            </span>
          </div>
          {!isEditing && argFieldCount > 0 && (
            <button
              type="button"
              onClick={() => setArgsExpanded((v) => !v)}
              aria-expanded={argsExpanded}
              aria-controls={argsId}
              aria-label={argsExpanded ? "Hide arguments" : "Show arguments"}
              className="min-h-touch text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none"
            >
              {argsExpanded ? "Hide" : "Show"}
              <ChevronDown
                aria-hidden="true"
                size={13}
                className={cn(
                  "transition-transform duration-150 motion-reduce:transition-none",
                  argsExpanded && "rotate-180"
                )}
              />
            </button>
          )}
        </header>

        {isEditing ? (
          <ApprovalArgumentEditor
            original={actionRequest.args}
            drafts={drafts}
            editedArgs={editedArgs}
            fieldErrors={fieldErrors}
            fieldPrefix={fieldPrefix}
            onDraftChange={(key, value) =>
              setDrafts((previous) => ({ ...previous, [key]: value }))
            }
            isLoading={isLoading}
          />
        ) : argFieldCount > 0 ? (
          <pre
            id={argsId}
            role="region"
            aria-label="Action arguments"
            tabIndex={0}
            hidden={!argsExpanded}
            className="focus-visible:ring-ring m-0 max-h-64 overflow-auto overscroll-contain rounded-none border-0 bg-transparent p-3 font-mono text-xs leading-relaxed wrap-anywhere wrap-break-word whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          >
            {argsAsJson}
          </pre>
        ) : null}
      </section>

      {showRejectionInput && !isEditing && (
        <div className="mt-3 space-y-1.5">
          <label
            htmlFor={noteId}
            className="text-foreground block text-xs font-medium"
          >
            Why are you rejecting this?{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </label>
          <Textarea
            id={noteId}
            ref={rejectionNote}
            value={rejectionMessage}
            onChange={(e) => setRejectionMessage(e.target.value)}
            aria-describedby={`${noteId}-hint`}
            className="focus-visible:ring-destructive/40 min-h-18 text-sm"
            rows={2}
            disabled={isLoading}
          />
          <p
            id={`${noteId}-hint`}
            className="text-muted-foreground text-xs"
          >
            The agent receives this note with the rejection.
          </p>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {isEditing ? (
          <>
            <Button
              variant="outline"
              size="default"
              ref={cancelButton}
              onClick={cancelEditing}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              size="default"
              className="max-sm:grow"
              onClick={handleEdit}
              disabled={isLoading || hasErrors}
            >
              <Check size={14} />
              {isLoading
                ? "Saving..."
                : onDecisionChange
                  ? "Mark edited action"
                  : "Save & approve"}
            </Button>
          </>
        ) : showRejectionInput ? (
          <>
            <Button
              variant="outline"
              size="default"
              onClick={() => {
                setMode("review");
                setRejectionMessage("");
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="default"
              className="max-sm:grow"
              onClick={handleRejectConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Rejecting..." : "Confirm reject"}
            </Button>
          </>
        ) : (
          <>
            {allowedDecisions.includes("reject") && (
              <Button
                variant="outline"
                size="default"
                ref={rejectTrigger}
                onClick={handleReject}
                disabled={isLoading}
                className="text-error hover:border-error hover:bg-error-primary hover:text-error"
              >
                <X size={14} />
                Reject
              </Button>
            )}
            {allowedDecisions.includes("edit") && (
              <Button
                variant="outline"
                size="default"
                ref={editTrigger}
                onClick={startEditing}
                disabled={isLoading}
              >
                <Pencil size={14} />
                Edit
              </Button>
            )}
            {allowedDecisions.includes("approve") && (
              <Button
                size="default"
                className="max-sm:grow"
                onClick={handleApprove}
                disabled={isLoading}
              >
                <Check size={14} />
                {isLoading ? "Approving..." : "Approve"}
              </Button>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
