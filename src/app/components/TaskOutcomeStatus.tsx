import React from "react";
import {
  Check,
  CircleCheck,
  Hourglass,
  Loader2,
  MessageCircleQuestion,
  OctagonAlert,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  parseRubricRevision,
  rubricResultLabel,
  verificationCopy,
  type RubricCheck,
  type RubricCriterion,
  type TaskVerification,
} from "../../lib/task-outcome";
import {
  ClampedEntry,
  DisclosureCard,
  RawSourceDisclosure,
} from "./DisclosureCard";

const TONE_ICON = {
  progress: <Loader2 className="motion-safe:animate-spin" />,
  success: <CircleCheck />,
  info: <MessageCircleQuestion />,
} as const;

function outcomeIcon(verification: TaskVerification) {
  const { tone } = verificationCopy(verification);
  if (tone !== "warning") return TONE_ICON[tone];
  if (verification.outcome.status === "blocked") return <OctagonAlert />;
  if (verification.outcome.status === "budget_exhausted") return <Hourglass />;
  return <TriangleAlert />;
}

/** Pass/fail list; icon shape and hidden text carry the verdict, not colour. */
export function RubricCriteriaList({
  criteria,
  label,
}: {
  criteria: readonly RubricCriterion[];
  label: string;
}) {
  if (!criteria.length) return null;
  return (
    <ul
      aria-label={label}
      className="mb-0 list-none space-y-2 pl-0"
    >
      {criteria.map((criterion, index) => (
        <li
          key={index}
          className="flex min-w-0 gap-2"
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              criterion.passed
                ? "bg-success-primary text-success"
                : "bg-warning-primary text-warning"
            )}
          >
            {criterion.passed ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </span>
          <div className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-5 [overflow-wrap:anywhere]">
            <span className="sr-only">
              {criterion.passed ? "Met: " : "Needs work: "}
            </span>
            <ClampedEntry text={criterion.name} />
            {criterion.gap && (
              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                <ClampedEntry text={criterion.gap} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CheckEntry({ check }: { check: RubricCheck }) {
  const failing = check.criteria.filter((c) => !c.passed).length;
  return (
    <li className="min-w-0 space-y-2">
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium tabular-nums text-foreground">
          Check {check.iteration + 1}
        </span>
        <span className="text-muted-foreground">
          {rubricResultLabel(check)}
          {failing > 0 && check.result !== "satisfied" && (
            <span className="tabular-nums"> · {failing} open</span>
          )}
        </span>
      </p>
      {check.unverified && (
        <p className="text-xs text-muted-foreground">
          The checker couldn’t account for every requirement, so passing items
          below are unconfirmed.
        </p>
      )}
      {check.explanation && (
        <div className="whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">
          <ClampedEntry text={check.explanation} />
        </div>
      )}
      <RubricCriteriaList
        criteria={check.criteria}
        label={`Check ${check.iteration + 1} requirements`}
      />
    </li>
  );
}

/**
 * Completion status for the answer it belongs to. Shown only for checked
 * tasks; simple answers render nothing. Per-check detail exists only while the
 * live stream supplied it, so a refreshed thread shows the status alone.
 */
export function TaskOutcomeStatus({
  verification,
}: {
  verification: TaskVerification;
}) {
  const copy = verificationCopy(verification);
  const { checks } = verification;
  const finished = checks.filter((check) => check.result !== null).length;
  return (
    <DisclosureCard
      data-testid="task-outcome-status"
      className="task-outcome-status"
      icon={outcomeIcon(verification)}
      tone={copy.tone}
      title={copy.title}
      description={copy.description}
      announcement={verification.checking ? undefined : copy.title}
      meta={
        finished > 0
          ? `${finished} ${finished === 1 ? "check" : "checks"}`
          : undefined
      }
    >
      {finished > 0 && (
        <ol
          aria-label="Completion checks"
          className="mb-0 list-none space-y-4 pl-0 [&>li+li]:border-t [&>li+li]:border-border [&>li+li]:pt-4"
        >
          {checks.map((check) => (
            <CheckEntry
              key={`${check.gradingRunId}:${check.iteration}`}
              check={check}
            />
          ))}
        </ol>
      )}
    </DisclosureCard>
  );
}

/**
 * The native grader's revision request. It is a runtime message, not the
 * user's words, so it never renders as a user bubble.
 */
export function RubricRevisionCard({
  content,
  checkNumber,
}: {
  content: string;
  checkNumber?: number;
}) {
  const revision = React.useMemo(() => parseRubricRevision(content), [content]);
  const open = revision.needsWork.length;
  const prefix = checkNumber ? `Check ${checkNumber}: ` : "";
  return (
    <DisclosureCard
      data-testid="rubric-revision"
      icon={<RotateCcw />}
      tone="neutral"
      title={`${prefix}${
        revision.unverified ? "Verification incomplete" : "Revision requested"
      }`}
      description={
        revision.unverified
          ? "The checker couldn’t confirm every requirement, so the agent is re-verifying."
          : "The completion check found gaps, so the agent is revising its answer."
      }
      meta={open > 0 ? `${open} open` : undefined}
    >
      {revision.feedback && (
        <div className="whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">
          <ClampedEntry text={revision.feedback} />
        </div>
      )}
      {open > 0 && (
        <section
          aria-label="Needs work"
          className="min-w-0"
        >
          <h3 className="mb-2 font-sans text-sm font-medium leading-5 tracking-normal">
            Needs work
          </h3>
          <RubricCriteriaList
            criteria={revision.needsWork}
            label="Requirements that need work"
          />
        </section>
      )}
      {revision.alreadyMet.length > 0 && (
        <section
          aria-label="Already met"
          className="min-w-0"
        >
          <h3 className="mb-2 font-sans text-sm font-medium leading-5 tracking-normal">
            Already met
          </h3>
          <RubricCriteriaList
            criteria={revision.alreadyMet.map((name) => ({
              name,
              passed: true,
              gap: null,
            }))}
            label="Requirements already met"
          />
        </section>
      )}
      <RawSourceDisclosure
        label="View checker message"
        content={revision.raw}
      />
    </DisclosureCard>
  );
}

/**
 * Status notice persisted by earlier task runs. The current run's notice is
 * replaced by `TaskOutcomeStatus`; history keeps a compact, non-prose row.
 */
export function TaskStatusNotice({ content }: { content: string }) {
  const exhausted = /allowance exhausted/i.test(content);
  return (
    <DisclosureCard
      data-testid="task-status-notice"
      icon={exhausted ? <Hourglass /> : <TriangleAlert />}
      tone="warning"
      title={
        exhausted ? "Run allowance used up" : "Completion could not be verified"
      }
      description={
        exhausted
          ? "Remaining requirements were left unverified."
          : "The answer above was kept but not confirmed against every requirement."
      }
    />
  );
}
