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
  ChevronUp,
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
}

const DESCRIPTION_PROSE_OVERRIDES =
  "text-sm leading-6 [&_p]:!mb-2 [&_p:last-child]:!mb-0 [&_ul]:!my-2 [&_ol]:!my-2 " +
  "[&_pre]:!my-2 [&_pre]:!rounded-md [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-sm " +
  "[&_h1]:!mt-0 [&_h2]:!mt-0 [&_h3]:!mt-0 [&_h1]:!mb-2 [&_h2]:!mb-2 [&_h3]:!mb-2";

export function ToolApprovalInterrupt({
  actionRequest,
  reviewConfig,
  onResume,
  onDecisionChange,
  currentDecision,
  isLoading,
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
          icon: <CheckCircle2 size={14} />,
          label: "Marked for approval",
        };
      case "reject":
        return {
          tone: "danger" as const,
          icon: <XCircle size={14} />,
          label: currentDecision.message?.trim()
            ? "Marked for rejection · note attached"
            : "Marked for rejection",
        };
      case "edit":
        return {
          tone: "neutral" as const,
          icon: <PencilLine size={14} />,
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
      currentDecision?.type === "reject" ? currentDecision.message ?? "" : ""
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

  return (
    <div
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-xl border shadow-sm",
        "border-warning bg-card text-foreground",
        "dark:shadow-none"
      )}
    >
      <div
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", "bg-warning-strong")}
      />

      <div className="relative p-3 pl-4 sm:p-5 sm:pl-6">
        {/* Header */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                "ring-warning bg-warning-primary text-warning ring-1"
              )}
            >
              <ShieldAlert
                aria-hidden="true"
                size={15}
                strokeWidth={2.25}
              />
            </span>
            <div className="flex flex-col leading-tight">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.18em]",
                  "text-warning"
                )}
              >
                Approval required
              </span>
              <span className="text-xs text-muted-foreground">
                Review the call below and choose how to proceed
              </span>
            </div>
          </div>
          <code
            className={cn(
              "min-w-0 max-w-full break-words rounded-md border border-border bg-muted/40 px-2 py-1",
              "font-mono text-[11px] font-medium text-foreground shadow-sm"
            )}
            title={actionRequest.name}
          >
            {actionRequest.name}
          </code>
        </header>

        {/* Markdown description */}
        {actionRequest.description ? (
          <div
            className={cn(
              "mb-4 break-words rounded-lg border border-border bg-muted/30 p-3 text-foreground sm:p-4"
            )}
          >
            <MarkdownContent
              content={actionRequest.description}
              className={DESCRIPTION_PROSE_OVERRIDES}
            />
          </div>
        ) : null}

        {/* Decision chip */}
        {decisionBanner && !isEditing && !showRejectionInput && (
          <div
            role="status"
            className={cn(
              "mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium",
              decisionBanner.tone === "success" &&
                "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
              decisionBanner.tone === "danger" &&
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
              decisionBanner.tone === "neutral" &&
                "bg-muted text-muted-foreground"
            )}
          >
            {decisionBanner.icon}
            <span>{decisionBanner.label}</span>
          </div>
        )}

        {/* Arguments / Edit form */}
        <section
          ref={argumentSection}
          className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30 text-foreground"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1 sm:px-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isEditing
                  ? "Edit arguments"
                  : currentDecision?.type === "edit"
                  ? "Edited arguments"
                  : "Arguments"}
              </span>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
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
                className="inline-flex min-h-touch shrink-0 items-center gap-1 rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {argsExpanded ? "Hide" : "Show"}
                {argsExpanded ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
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
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {argsAsJson}
            </pre>
          ) : null}
        </section>

        {/* Rejection note input */}
        {showRejectionInput && !isEditing && (
          <div
            className={cn(
              "mt-4 rounded-lg border p-3",
              "border-red-200/70 bg-red-50/60",
              "dark:border-red-500/20 dark:bg-red-500/5"
            )}
          >
            <label
              htmlFor={noteId}
              className="mb-1.5 block text-xs font-medium text-red-700 dark:text-red-300"
            >
              Why are you rejecting this?
            </label>
            <Textarea
              id={noteId}
              ref={rejectionNote}
              value={rejectionMessage}
              onChange={(e) => setRejectionMessage(e.target.value)}
              placeholder="Optional note explaining why. The agent will see it."
              className="text-sm"
              rows={2}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Actions */}
        <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
                  className="text-destructive hover:bg-destructive/10"
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
      </div>
    </div>
  );
}
