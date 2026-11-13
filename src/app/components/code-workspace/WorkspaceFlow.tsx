"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  FolderGit2,
  FolderMinus,
  Loader2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelTabs } from "@/components/ui/panel-tabs";
import { useRepositoryWorkspace } from "@/app/hooks/useRepositoryWorkspace";
import type { ResolvedTarget } from "@/lib/code-workspace";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceFooter } from "./WorkspaceFooter";
import { WorkspaceStatus } from "./WorkspaceStatus";
import { WorkspaceSources } from "./WorkspaceSources";
import { SelectedRevisions } from "./SelectedRevisions";
import { WorkspaceAnalysisForm } from "./WorkspaceAnalysisForm";
import type { AnalysisFormDraft, SourceDraft, WorkspaceTab } from "./types";

/** Keep drafts outside the dialog portal so closing it never discards input. */
export function WorkspaceFlow({
  threadId,
  accountId,
  open,
  chatBusy,
  onJobSubmitted,
}: {
  threadId: string;
  accountId: string;
  open: boolean;
  chatBusy: boolean;
  onJobSubmitted: () => void;
}) {
  const state = useRepositoryWorkspace(
    threadId,
    accountId,
    open,
    onJobSubmitted
  );
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  useEffect(() => {
    if (!open) setConfirmRelease(false);
  }, [open]);
  const [tab, setTab] = useState<WorkspaceTab>("repositories");
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>({
    serverId: "",
    repository: "",
    selector: "",
    resource: "branches",
  });
  const [analysisDraft, setAnalysisDraft] = useState<AnalysisFormDraft>({
    question: "",
    engine: "",
    pairs: [],
    checklist: "",
  });
  const locked = Boolean(state.busy) || state.running || chatBusy;
  const formId = `${id}-analysis-form`;
  const selectedEngine = state.catalog?.engines.find(
    ({ id }) => id === (analysisDraft.engine || state.catalog?.default_engine)
  );
  const statusJob =
    state.analysisJob ?? (state.workspaceReady ? null : state.prepareJob);
  const status = state.analysisJob ? state.analysisStatus : state.prepareStatus;
  const selectTab = (next: WorkspaceTab, focus = false) => {
    setTab(next);
    content.current?.scrollTo({ top: 0 });
    if (focus)
      requestAnimationFrame(() =>
        document.getElementById(`${id}-tab-${next}`)?.focus()
      );
  };
  const remove = (handle: string) => {
    state.removeTarget(handle);
    setAnalysisDraft((previous) => ({
      ...previous,
      pairs: previous.pairs.filter(
        ({ base, target }) => base !== handle && target !== handle
      ),
    }));
  };
  const dependencies = (item: ResolvedTarget) => {
    selectTab("repositories");
    void state.browseSource({
      server_id: item.target.ref.server_id,
      resource: "externals",
      ref: item.target.ref,
      filters: { revision: item.target.revision },
    });
  };
  let summary = state.targets.length
    ? `${state.targets.length} pinned ${
        state.targets.length === 1 ? "revision" : "revisions"
      } · checkout required`
    : "Add at least one revision to prepare source.";
  if (state.workspaceReady)
    summary = `Ready to analyze · ${state.targets.length} pinned revisions`;
  if (state.running) summary = "Work continues when you return to chat.";
  if (state.analysisExpired)
    summary = "Checkout expired. Prepare the selected revisions again.";
  if (chatBusy)
    summary = "Wait for the current chat turn before changing source.";
  return (
    <WorkspaceDialog>
      <div className="flex min-w-0 shrink-0 items-center justify-between border-b border-border bg-card pr-2 @container/panel">
        <PanelTabs
          tabs={[
            { id: "repositories", label: "Repositories", icon: FolderGit2 },
            { id: "analysis", label: "Analysis", icon: Play },
          ]}
          value={tab}
          onValueChange={selectTab}
          idPrefix={id}
          label="Repository workspace sections"
          activation="manual"
          className="grid max-w-sm flex-1 grid-cols-2 px-2 [&>button]:min-w-0 [&>button]:flex-wrap [&>button]:whitespace-normal [&>button]:px-2"
        />
        {state.prepareJob && (
          <Button
            ref={releaseButton}
            type="button"
            variant="ghost"
            size="icon"
            className="size-touch shrink-0 text-muted-foreground"
            aria-label="Release conversation checkout"
            title="Release conversation checkout"
            disabled={locked}
            onClick={() => setConfirmRelease(true)}
          >
            <FolderMinus aria-hidden="true" />
          </Button>
        )}
      </div>
      <div
        ref={content}
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {state.restoring && (
          <div className="space-y-2 border-b border-border bg-muted/30 px-4 py-3 text-sm sm:px-6">
            <p role="status">
              {state.prepareStatus.error || state.analysisStatus.error
                ? "Couldn’t reconnect to the checkout. Retrying…"
                : "Restoring this conversation’s checkout…"}
            </p>
            {(state.prepareStatus.error || state.analysisStatus.error) && (
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                onClick={state.forgetUnavailable}
              >
                Start a new selection
              </Button>
            )}
          </div>
        )}
        {tab === "repositories" ? (
          <WorkspaceSources
            state={state}
            locked={locked}
            draft={sourceDraft}
            onDraftChange={setSourceDraft}
            onRemove={remove}
            onDependencies={dependencies}
          />
        ) : (
          <div className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-4 border-b border-border p-4 sm:p-6 md:border-b-0 md:border-r">
              {!state.workspaceReady && (
                <p
                  role="status"
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
                >
                  Prepare source in Repositories before running an analysis.
                  Your question stays here while you choose revisions.
                </p>
              )}
              <WorkspaceAnalysisForm
                id={formId}
                targets={state.targets}
                catalog={state.catalog}
                catalogError={state.catalogError}
                onRetryCatalog={state.retryCatalog}
                disabled={locked || !state.workspaceReady}
                draft={analysisDraft}
                onDraftChange={setAnalysisDraft}
                onAnalyze={state.analyze}
              />
            </div>
            <div className="min-w-0 bg-muted/20 p-4 sm:p-6">
              <SelectedRevisions
                targets={state.targets}
                servers={state.servers}
              />
            </div>
          </div>
        )}
      </div>
      {statusJob && (
        <WorkspaceStatus
          key={statusJob.job_id}
          job={statusJob}
          error={status.error}
          cancel={status.cancel}
        />
      )}
      <WorkspaceFooter
        summary={summary}
        error={
          state.error && !["browse", "resolve"].includes(state.error.operation)
            ? state.error.message
            : null
        }
        notice={state.notice}
        onRelease={state.prepareJob ? state.release : undefined}
        releaseDisabled={locked}
        confirmRelease={confirmRelease}
        onCancelRelease={() => {
          setConfirmRelease(false);
          requestAnimationFrame(() => releaseButton.current?.focus());
        }}
      >
        {tab === "analysis" ? (
          state.workspaceReady ? (
            <Button
              type="submit"
              form={formId}
              className="min-h-touch"
              disabled={
                locked ||
                !analysisDraft.question.trim() ||
                (state.catalog !== null && !selectedEngine?.ready)
              }
            >
              <Play aria-hidden="true" />
              {state.busy === "analyze" ? "Starting analysis…" : "Run analysis"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="min-h-touch"
              onClick={() => selectTab("repositories", true)}
            >
              Back to repositories
            </Button>
          )
        ) : state.workspaceReady ? (
          <Button
            type="button"
            className="min-h-touch"
            aria-label="Continue to analysis"
            onClick={() => selectTab("analysis", true)}
          >
            Continue <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            className="min-h-touch"
            disabled={locked || !state.targets.length}
            onClick={() => void state.prepare()}
          >
            {state.busy === "prepare" ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <FolderGit2 aria-hidden="true" />
            )}
            {state.busy === "prepare"
              ? "Starting checkout…"
              : state.prepareJob &&
                ["queued", "running", "cancel_requested"].includes(
                  state.prepareJob.status
                )
              ? "Checkout in progress"
              : state.targets.length
              ? `Prepare ${state.targets.length} ${
                  state.targets.length === 1 ? "revision" : "revisions"
                }`
              : "Prepare workspace"}
          </Button>
        )}
      </WorkspaceFooter>
    </WorkspaceDialog>
  );
}
