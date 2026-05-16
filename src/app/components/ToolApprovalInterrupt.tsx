"use client";

import { useEffect, useMemo, useState } from "react";
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

const ARGS_PROSE_OVERRIDES =
  "text-xs [&_pre]:!my-0 [&_pre]:!rounded-md [&_pre]:!border-0";

export function ToolApprovalInterrupt({
  actionRequest,
  reviewConfig,
  onResume,
  onDecisionChange,
  currentDecision,
  isLoading,
}: ToolApprovalInterruptProps) {
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>({});
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [argsExpanded, setArgsExpanded] = useState(true);

  const allowedDecisions = reviewConfig?.allowedDecisions ?? [
    "approve",
    "reject",
    "edit",
  ];

  useEffect(() => {
    if (currentDecision?.type === "reject") {
      setRejectionMessage(currentDecision.message ?? "");
      return;
    }

    if (currentDecision?.type === "edit") {
      setEditedArgs(JSON.parse(JSON.stringify(currentDecision.edited_action.args)));
    }
  }, [currentDecision]);

  const argFieldCount = useMemo(
    () => Object.keys(actionRequest.args ?? {}).length,
    [actionRequest.args]
  );

  const argsAsMarkdown = useMemo(
    () =>
      "```json\n" + JSON.stringify(actionRequest.args ?? {}, null, 2) + "\n```",
    [actionRequest.args]
  );

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
    if (onDecisionChange) {
      onDecisionChange(decision);
      return;
    }

    onResume?.({ decisions: [decision] });
  };

  const handleApprove = () => {
    setShowRejectionInput(false);
    setIsEditing(false);
    emitDecision({ type: "approve" });
  };

  const handleReject = () => {
    if (showRejectionInput) {
      handleRejectConfirm();
    } else {
      setIsEditing(false);
      setShowRejectionInput(true);
    }
  };

  const handleRejectConfirm = () => {
    emitDecision({
      type: "reject",
      message: rejectionMessage.trim() || undefined,
    });
    setShowRejectionInput(false);
  };

  const handleEdit = () => {
    if (isEditing) {
      emitDecision({
        type: "edit",
        edited_action: {
          name: actionRequest.name,
          args: editedArgs,
        },
      });
      setIsEditing(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditedArgs(JSON.parse(JSON.stringify(actionRequest.args)));
    setShowRejectionInput(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedArgs({});
  };

  const updateEditedArg = (key: string, value: string) => {
    try {
      const parsedValue =
        value.trim().startsWith("{") || value.trim().startsWith("[")
          ? JSON.parse(value)
          : value;
      setEditedArgs((prev) => ({ ...prev, [key]: parsedValue }));
    } catch {
      setEditedArgs((prev) => ({ ...prev, [key]: value }));
    }
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border shadow-sm transition-shadow",
        "border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-background to-background",
        "hover:shadow-md",
        "dark:border-amber-400/20 dark:from-amber-500/10 dark:via-background dark:to-background"
      )}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          "bg-gradient-to-b from-amber-400 via-amber-500 to-amber-300",
          "dark:from-amber-400/80 dark:via-amber-500/70 dark:to-amber-300/70"
        )}
      />

      <div className="relative p-5 pl-6">
        {/* Header */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "relative inline-flex h-8 w-8 items-center justify-center rounded-full",
                "bg-amber-100 text-amber-700 ring-1 ring-amber-300/50",
                "dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30"
              )}
            >
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-full bg-amber-400/30 opacity-60 dark:bg-amber-400/20"
              />
              <ShieldAlert size={15} className="relative" strokeWidth={2.25} />
            </span>
            <div className="flex flex-col leading-tight">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.18em]",
                  "text-amber-700/90 dark:text-amber-300/90"
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
              "rounded-md border border-border bg-background/80 px-2 py-1",
              "font-mono text-[11px] font-medium text-foreground shadow-sm backdrop-blur-sm"
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
              "mb-4 rounded-lg border border-border/70 bg-background/70 p-4",
              "backdrop-blur-sm"
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
        <section className="overflow-hidden rounded-lg border border-border/70 bg-background/80 backdrop-blur-sm">
          <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {isEditing ? "Edit arguments" : "Arguments"}
              </span>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                {argFieldCount} field{argFieldCount === 1 ? "" : "s"}
              </span>
            </div>
            {!isEditing && argFieldCount > 0 && (
              <button
                type="button"
                onClick={() => setArgsExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
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
            <div className="space-y-3 p-4">
              {Object.entries(actionRequest.args).map(([key, value]) => (
                <div key={key}>
                  <label className="mb-1 block font-mono text-[11px] font-medium text-foreground">
                    {key}
                  </label>
                  <Textarea
                    value={
                      editedArgs[key] !== undefined
                        ? typeof editedArgs[key] === "string"
                          ? (editedArgs[key] as string)
                          : JSON.stringify(editedArgs[key], null, 2)
                        : typeof value === "string"
                        ? value
                        : JSON.stringify(value, null, 2)
                    }
                    onChange={(e) => updateEditedArg(key, e.target.value)}
                    className="font-mono text-xs"
                    rows={
                      typeof value === "string" && value.length < 100 ? 2 : 4
                    }
                    disabled={isLoading}
                  />
                </div>
              ))}
            </div>
          ) : argsExpanded && argFieldCount > 0 ? (
            <div className="px-2 py-1">
              <MarkdownContent
                content={argsAsMarkdown}
                className={ARGS_PROSE_OVERRIDES}
              />
            </div>
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
            <label className="mb-1.5 block text-[11px] font-medium text-red-700 dark:text-red-300">
              Why are you rejecting this?
            </label>
            <Textarea
              value={rejectionMessage}
              onChange={(e) => setRejectionMessage(e.target.value)}
              placeholder="Optional note — the agent will see this explanation..."
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
                size="sm"
                onClick={cancelEditing}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={isLoading}
                className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
              >
                <Check size={14} />
                {isLoading ? "Saving..." : "Save & approve"}
              </Button>
            </>
          ) : showRejectionInput ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRejectionInput(false);
                  setRejectionMessage("");
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
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
                  size="sm"
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
                  size="sm"
                  onClick={startEditing}
                  disabled={isLoading}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
              )}
              {allowedDecisions.includes("approve") && (
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={isLoading}
                  className={cn(
                    "bg-green-600 text-white hover:bg-green-700",
                    "dark:bg-green-600 dark:hover:bg-green-700"
                  )}
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
