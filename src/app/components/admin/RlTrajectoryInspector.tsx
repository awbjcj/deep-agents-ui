"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DisclosureSection,
  LoadingRow,
} from "@/app/components/admin/primitives";
import { SettingsLoadError } from "@/app/components/settings/SettingsFeedback";
import { Badge } from "@/components/ui/badge";
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
  apiCurateRlSession,
  apiDeleteRlSession,
  apiGetRlSession,
  rlPreviewText,
  type RlCurationStatus,
  type RlRating,
  type RlSession,
  type RlStep,
} from "@/lib/rl-dataset";

export function RlTrajectoryInspector({
  sessionId,
  onClose,
  onChange,
  onRestoreFocus,
}: {
  sessionId: string | null;
  onClose: () => void;
  onChange: () => void;
  onRestoreFocus: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={sessionId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="animate-none! grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden sm:max-w-4xl"
        overlayClassName="animate-none!"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle
            ref={title}
            tabIndex={-1}
            className="w-fit max-w-full rounded-xs"
          >
            Anonymized trajectory
          </DialogTitle>
          <DialogDescription className="font-mono text-xs [overflow-wrap:anywhere]">
            {sessionId}
          </DialogDescription>
        </DialogHeader>
        {sessionId && (
          <SessionDetails
            key={sessionId}
            sessionId={sessionId}
            onChange={onChange}
            onDelete={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SessionDetails({
  sessionId,
  onChange,
  onDelete,
}: {
  sessionId: string;
  onChange: () => void;
  onDelete: () => void;
}) {
  const [session, setSession] = useState<RlSession>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiGetRlSession(sessionId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSession(data);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [sessionId, attempt]);

  async function curate(curationStatus: RlCurationStatus) {
    if (working || curationStatus === session?.curation_status) return;
    setWorking(true);
    setActionError("");
    try {
      const result = await apiCurateRlSession(sessionId, curationStatus);
      setSession((current) => current && { ...current, ...result });
      onChange();
      toast.success("Curation status updated");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Could not update curation status."
      );
    } finally {
      setWorking(false);
    }
  }

  async function deleteSession() {
    setWorking(true);
    setActionError("");
    try {
      await apiDeleteRlSession(sessionId);
      toast.success("Session deleted");
      onChange();
      onDelete();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not delete the session."
      );
    } finally {
      setWorking(false);
    }
  }

  if (error)
    return (
      <SettingsLoadError
        message={error}
        onRetry={() => {
          setError("");
          setAttempt((current) => current + 1);
        }}
      />
    );
  if (!session) return <LoadingRow compact />;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <SessionContent session={session} />
      <div className="border-border/70 shrink-0 space-y-2 border-t pt-3">
        <div
          role="group"
          aria-label="Curation actions"
          className="flex flex-wrap gap-2"
        >
          <Button
            type="button"
            className="min-h-touch aria-disabled:opacity-50"
            aria-disabled={working || session.curation_status === "approved"}
            onClick={() => void curate("approved")}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-touch aria-disabled:opacity-50"
            aria-disabled={working || session.curation_status === "excluded"}
            onClick={() => void curate("excluded")}
          >
            Exclude
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-touch aria-disabled:opacity-50"
            aria-disabled={working || session.curation_status === "unreviewed"}
            onClick={() => void curate("unreviewed")}
          >
            Return to unreviewed
          </Button>
          <Button
            ref={deleteTrigger}
            type="button"
            variant="ghost"
            className="text-destructive min-h-touch aria-disabled:opacity-50"
            aria-disabled={working}
            onClick={() => {
              if (working) return;
              setActionError("");
              setConfirmDelete(true);
            }}
          >
            <Trash2 aria-hidden="true" /> Delete
          </Button>
        </div>
        {actionError && !confirmDelete && (
          <p
            role="alert"
            className="text-destructive text-sm"
          >
            {actionError}
          </p>
        )}
      </div>
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!working) {
            setActionError("");
            setConfirmDelete(open);
          }
        }}
      >
        <DialogContent
          showCloseButton={!working}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelDelete.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            deleteTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              Permanently delete this anonymized trajectory and its{" "}
              {session.rating_count}{" "}
              {session.rating_count === 1 ? "rating" : "ratings"}.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <p
              role="alert"
              className="text-destructive text-sm"
            >
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button
              ref={cancelDelete}
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => {
                setActionError("");
                setConfirmDelete(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={working}
              onClick={() => void deleteSession()}
            >
              {working ? "Deleting…" : "Delete session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionContent({ session }: { session: RlSession }) {
  const { trajectory } = session;
  const ratingsByStep = new Map<number, RlRating[]>();
  for (const rating of session.ratings) {
    const ratings = ratingsByStep.get(rating.step_index) ?? [];
    ratings.push(rating);
    ratingsByStep.set(rating.step_index, ratings);
  }

  return (
    <div
      role="region"
      aria-label="Trajectory details"
      tabIndex={0}
      className="focus-visible:ring-primary/40 min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{session.graph_id}</Badge>
        {session.variant && <Badge variant="outline">{session.variant}</Badge>}
        {session.approval_mode && (
          <Badge variant="outline">
            Approval mode · {session.approval_mode.replaceAll("_", " ")}
          </Badge>
        )}
        <Badge
          variant="outline"
          className="capitalize"
        >
          {session.curation_status}
        </Badge>
        <Badge variant="outline">
          {
            {
              ready: "Complete capture",
              partial: "Partial capture",
              failed: "Capture failed",
            }[session.capture_status]
          }
        </Badge>
      </div>
      {session.capture_warnings.length > 0 && (
        <div className="settings-surface space-y-1 p-3 text-sm">
          <h4 className="font-semibold">Capture warnings</h4>
          <ul className="text-muted-foreground list-inside list-disc">
            {session.capture_warnings.map((warning) => (
              <li
                key={warning}
                className="[overflow-wrap:anywhere]"
              >
                {warning.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Conversation steps</h4>
        <ol className="space-y-2 ps-0">
          {trajectory.steps.map((step) => (
            <TrajectoryStep
              key={step.step_index}
              step={step}
              ratings={ratingsByStep.get(step.step_index)}
            />
          ))}
        </ol>
      </div>
      <TrajectoryEvents trajectory={trajectory} />

      <DisclosureSection title={`Pinned ratings (${session.ratings.length})`}>
        <div className="space-y-3">
          {session.ratings.map((rating) => (
            <div
              key={rating.id}
              className="space-y-1"
            >
              <p className="text-muted-foreground text-xs">
                Step {rating.step_index + 1} ·{" "}
                {rating.subagent_name ??
                  (rating.target_type === "agent_message"
                    ? "Agent response"
                    : "Subagent run")}
                {rating.model_name ? ` · ${rating.model_name}` : ""}
              </p>
              <PinnedRating rating={rating} />
            </div>
          ))}
        </div>
      </DisclosureSection>

      <DisclosureSection
        title={`Harness configurations (${Object.keys(session.harness_configs).length})`}
        subtitle={`Schema version ${session.schema_version}`}
      >
        <div className="space-y-2">
          {Object.entries(session.harness_configs).map(([hash, config]) => (
            <DisclosureSection
              key={hash}
              title={`${config.agent_name || config.graph_id || "Harness configuration"}${hash === session.root_harness_hash ? " · Root" : ""}`}
              subtitle={hash.slice(0, 12)}
            >
              {config.app_version && (
                <p className="text-muted-foreground mb-2 text-xs">
                  App version {config.app_version}
                </p>
              )}
              <Preview
                label="System prompt"
                value={config.sanitized_system_prompt}
              />
              <Preview
                label="Tool schemas"
                value={config.tool_schemas}
              />
              <Preview
                label="System skills"
                value={config.system_skills}
              />
            </DisclosureSection>
          ))}
        </div>
      </DisclosureSection>
    </div>
  );
}

function TrajectoryEvents({
  trajectory,
}: {
  trajectory: RlSession["trajectory"];
}) {
  const { compaction_events, rubric_evaluations, task_outcome } = trajectory;
  if (
    !compaction_events.length &&
    !rubric_evaluations.length &&
    task_outcome == null
  )
    return null;
  return (
    <DisclosureSection title="Harness events">
      <Preview
        label="Context compaction"
        value={compaction_events}
      />
      <Preview
        label="Rubric evaluations"
        value={rubric_evaluations}
      />
      <Preview
        label="Task outcome"
        value={task_outcome}
      />
    </DisclosureSection>
  );
}

function PinnedRating({ rating }: { rating: RlRating }) {
  const tags = new Map(rating.tag_metadata.map((tag) => [tag.id, tag]));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">
        <Star aria-hidden="true" /> {rating.score}/5{" "}
        <span className="sr-only">stars</span>
      </Badge>
      {rating.tags.map((id) => (
        <Badge
          key={id}
          variant="outline"
          title={tags.get(id)?.description}
        >
          {tags.get(id)?.label ?? id.replaceAll("_", " ")}
        </Badge>
      ))}
    </div>
  );
}

function TrajectoryStep({
  step,
  ratings = [],
}: {
  step: RlStep;
  ratings?: RlRating[];
}) {
  const agentRating = ratings.find(
    (rating) => rating.target_type === "agent_message"
  );
  const model = step.model_meta;
  return (
    <li className="settings-surface min-w-0 space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h5 className="text-sm font-semibold capitalize">
          {step.step_index + 1}. {step.role}
        </h5>
        {model?.model && <Badge variant="outline">{model.model}</Badge>}
        {agentRating && <PinnedRating rating={agentRating} />}
      </div>
      {typeof step.content === "string" ? (
        step.content && (
          <p className="text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
            {step.content}
          </p>
        )
      ) : (
        <Preview value={step.content} />
      )}
      <Preview
        label="Reasoning summary"
        value={step.reasoning_summary}
      />
      <Preview
        label="Model metadata"
        value={model}
      />
      <Preview
        label="Refusals"
        value={step.refusals}
      />
      <Preview
        label="Files"
        value={step.generated_files}
      />
      <Preview
        label="Sources"
        value={step.sources}
      />
      {step.tool_calls.map((call, index) => (
        <DisclosureSection
          key={call.tool_call_id ?? index}
          title={call.name ?? "Unnamed tool"}
          subtitle={[
            call.status,
            call.approval_decision ? "HITL approval" : "",
            call.truncated ? "Result truncated" : "",
            call.args_repaired ? "Arguments repaired" : "",
            call.deduplicated ? "Deduplicated" : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <Preview
            label="Arguments"
            value={call.args}
          />
          <Preview
            label="Result"
            value={call.result}
          />
          {call.truncated && (
            <p className="text-muted-foreground mt-2 text-xs">
              {call.original_bytes == null
                ? "Result truncated at the capture limit."
                : `Result truncated at the capture limit. Original size: ${call.original_bytes.toLocaleString()} bytes.`}
            </p>
          )}
          <Preview
            label="HITL approval decision"
            value={call.approval_decision}
          />
        </DisclosureSection>
      ))}
      {step.subagent_runs.map((run) => {
        const runRating = ratings.find(
          (rating) =>
            rating.target_type === "subagent_run" &&
            rating.subagent_step_index === run.subagent_step_index
        );
        return (
          <DisclosureSection
            key={run.tool_call_id}
            title={
              run.subagent_name
                ? `${run.subagent_name} subagent`
                : "Subagent run"
            }
            subtitle={[
              run.status,
              run.model_meta?.model,
              runRating && `${runRating.score}/5 stars`,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <div className="space-y-2">
              {runRating && <PinnedRating rating={runRating} />}
              {run.harness_config_hash && (
                <p className="text-muted-foreground text-xs">
                  Harness configuration{" "}
                  <span className="font-mono">
                    {run.harness_config_hash.slice(0, 12)}
                  </span>
                </p>
              )}
              <Preview
                label="Task input"
                value={run.task_input}
              />
              <Preview
                label="Model metadata"
                value={run.model_meta}
              />
              <ol className="space-y-2 ps-0">
                {run.steps.map((nested) => (
                  <TrajectoryStep
                    key={nested.step_index}
                    step={nested}
                  />
                ))}
              </ol>
              <Preview
                label="Final output"
                value={run.final_output}
              />
            </div>
          </DisclosureSection>
        );
      })}
    </li>
  );
}

function Preview({
  label,
  value,
}: {
  label?: string;
  value: unknown;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
    return null;
  if (!label) return <PayloadText value={value} />;
  return (
    <details
      className="group mt-1"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="hover:text-primary focus-visible:ring-primary/40 w-fit cursor-pointer rounded-xs py-2 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none">
        {label}
      </summary>
      {open && <PayloadText value={value} />}
    </details>
  );
}

function PayloadText({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted/45 max-h-96 overflow-auto rounded-md p-2 text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
      {rlPreviewText(value)}
    </pre>
  );
}
