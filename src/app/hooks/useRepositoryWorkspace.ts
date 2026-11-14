"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useCodeAnalysisJob } from "@/app/hooks/useCodeAnalysisJob";
import {
  getAnalysisEngines,
  shouldPoll,
  type AnalysisJobView,
  type EngineCatalog,
} from "@/lib/code-analysis";
import {
  analyzePreparedWorkspace,
  listWorkspaceSource,
  MAX_WORKSPACE_TARGETS,
  prepareWorkspace,
  releasePreparedWorkspace,
  resolveWorkspaceTarget,
  WorkspaceError,
  workspaceResumeSchema,
  type WorkspaceResume,
  type RepositoryRef,
  type ResolvedTarget,
  type SourceQuery,
} from "@/lib/code-workspace";
import { listScmServers, type ScmServerView } from "@/lib/scm";
import type {
  BrowseState,
  AnalysisDraft,
} from "@/app/components/code-workspace/types";

function errorText(error: unknown) {
  return error instanceof WorkspaceError ||
    (error instanceof Error && error.name === "Error")
    ? error.message
    : "Couldn’t complete the request. Try again.";
}

type Operation = "browse" | "resolve" | "prepare" | "analyze" | "release";

/** Own draft and request state for exactly one conversation. */
export function useRepositoryWorkspace(
  threadId: string,
  accountId: string,
  open: boolean,
  onJobSubmitted: () => void
) {
  const [draftTargets, setTargets] = useState<ResolvedTarget[]>([]);
  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [servers, setServers] = useState<ScmServerView[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverAttempt, setServerAttempt] = useState(0);
  const [catalog, setCatalog] = useState<EngineCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [preparation, setPreparation] = useState<AnalysisJobView | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisJobView | null>(null);
  const [invalidated, setInvalidated] = useState(false);
  const [busy, setBusy] = useState<Operation | null>(null);
  const [error, setError] = useState<{
    operation: Operation;
    message: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const submission = useRef<{ input: string; key: string } | null>(null);
  const [resume, setResume] = useState<WorkspaceResume | null>(null);
  const storageKey = `code-workspace:${accountId}:${threadId}`;
  const prepareStatus = useCodeAnalysisJob(
    resume?.prepareId ?? preparation?.job_id ?? null
  );
  const analysisStatus = useCodeAnalysisJob(
    resume?.analysisId ?? analysis?.job_id ?? null
  );
  const ownedJob = (job: AnalysisJobView | null, operation: string) =>
    job?.thread_id === threadId && job.operation === operation ? job : null;
  const prepareJob = ownedJob(prepareStatus.job ?? preparation, "prepare");
  const analysisJob = ownedJob(analysisStatus.job ?? analysis, "analyze");
  const handles = prepareJob?.payload?.target_handles;
  const targets = draftTargets.length
    ? draftTargets
    : resume && handles?.length === resume.targets.length
    ? resume.targets.map((target, index) => ({
        target,
        target_handle: handles[index],
      }))
    : [];
  const restoring = Boolean(
    (resume?.prepareId && !prepareJob) || (resume?.analysisId && !analysisJob)
  );
  const running =
    restoring ||
    Boolean(
      (prepareJob && shouldPoll(prepareJob.status)) ||
        (analysisJob && shouldPoll(analysisJob.status))
    );
  function remember(value: WorkspaceResume | null) {
    setResume(value);
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage can be disabled; live job tracking still works. */
    }
  }

  useEffect(() => {
    try {
      const parsed = workspaceResumeSchema.safeParse(
        JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
      );
      if (parsed.success) setResume(parsed.data);
    } catch {
      /* Ignore an unavailable or invalid tab session. */
    }
  }, [storageKey]);
  const workspace =
    !invalidated &&
    targets.length > 0 &&
    prepareJob?.status === "succeeded" &&
    typeof prepareJob.result.workspace_handle === "string"
      ? prepareJob.result.workspace_handle
      : null;
  const analysisExpired =
    analysisJob?.error_code === "workspace_expired" ||
    analysisJob?.error_code === "not_found";

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setServerLoading(true);
    setServerError(null);
    void listScmServers(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setServers(result.filter((server) => server.enabled));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setServerError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setServerLoading(false);
      });
    return () => controller.abort();
  }, [open, serverAttempt]);
  useEffect(() => {
    if (!open || !workspace || analysisExpired) return;
    let disposed = false;
    setCatalogError(null);
    void getAnalysisEngines()
      .then((result) => {
        if (!disposed) setCatalog(result);
      })
      .catch((error) => {
        if (!disposed) setCatalogError(errorText(error));
      });
    return () => {
      disposed = true;
    };
  }, [open, workspace, analysisExpired, catalogAttempt]);

  async function run(
    operation: Operation,
    task: (signal: AbortSignal) => Promise<void>
  ) {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    setBusy(operation);
    setError(null);
    setNotice("");
    try {
      await task(controller.signal);
      return !controller.signal.aborted;
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (
          operation === "analyze" &&
          caught instanceof WorkspaceError &&
          ["workspace_expired", "not_found"].includes(caught.code ?? "")
        ) {
          setTargets(targets);
          remember(null);
          setInvalidated(true);
          setError({
            operation,
            message:
              "The prepared workspace is no longer available. Prepare these revisions again.",
          });
        } else if (
          operation === "prepare" &&
          caught instanceof WorkspaceError &&
          ["target_expired", "not_found", "revision_unavailable"].includes(
            caught.code ?? ""
          )
        ) {
          setError({
            operation,
            message: `${errorText(
              caught
            )} Remove and re-add the affected revisions before retrying.`,
          });
        } else {
          setError({ operation, message: errorText(caught) });
        }
      }
      return false;
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  function keyFor(operation: string, input: object) {
    const fingerprint = JSON.stringify([operation, input]);
    if (submission.current?.input !== fingerprint)
      submission.current = { input: fingerprint, key: uuidv4() };
    return submission.current.key;
  }

  function changedTargets() {
    remember(null);
    setPreparation(null);
    setInvalidated(false);
    setAnalysis(null);
    submission.current = null;
  }

  return {
    targets,
    browse,
    busy,
    error,
    notice,
    servers,
    serverError,
    serverLoading,
    catalog,
    catalogError,
    prepareJob,
    analysisJob,
    prepareStatus,
    analysisStatus,
    restoring,
    forgetUnavailable: () => {
      setTargets(targets);
      changedTargets();
    },
    running,
    workspaceReady: Boolean(workspace) && !analysisExpired,
    analysisExpired,
    retryServers: () => setServerAttempt((value) => value + 1),
    retryCatalog: () => setCatalogAttempt((value) => value + 1),
    dismissBrowse: () => {
      // A dismissed page must not reappear when its pending lookup finishes.
      if (busy === "browse") {
        request.current?.abort();
        request.current = null;
        setBusy(null);
      }
      setBrowse(null);
    },
    browseSource: (query: SourceQuery, append = false) =>
      run("browse", async (signal) => {
        if (!append) setBrowse(null);
        const page = await listWorkspaceSource(threadId, query, signal);
        if (!signal.aborted)
          setBrowse((previous) => ({
            query,
            page:
              append && previous
                ? {
                    ...page,
                    items: [...previous.page.items, ...page.items],
                    warnings: [
                      ...new Set([...previous.page.warnings, ...page.warnings]),
                    ],
                  }
                : page,
          }));
      }),
    addTarget: (ref: RepositoryRef, selector: string) =>
      run("resolve", async (signal) => {
        if (targets.length >= MAX_WORKSPACE_TARGETS)
          throw new WorkspaceError("This workspace already has 20 targets.");
        const next = await resolveWorkspaceTarget(
          threadId,
          ref,
          selector,
          signal
        );
        if (signal.aborted) return;
        if (
          targets.some(
            ({ target }) =>
              target.ref.server_id === ref.server_id &&
              target.ref.repository === ref.repository &&
              target.revision === next.target.revision
          )
        )
          throw new WorkspaceError(
            "That exact revision is already in the workspace."
          );
        changedTargets();
        setTargets([...targets, next]);
        setNotice(
          `Added ${ref.repository} at ${next.target.revision.slice(0, 12)}.`
        );
      }),
    removeTarget: (handle: string) => {
      if (request.current || running) return;
      changedTargets();
      setError(null);
      setTargets(targets.filter((item) => item.target_handle !== handle));
      setNotice("Revision removed from the selection.");
    },
    prepare: () =>
      run("prepare", async (signal) => {
        if (!targets.length || running) return;
        const handles = targets.map((item) => item.target_handle);
        const job = await prepareWorkspace(
          threadId,
          handles,
          keyFor("prepare", handles),
          signal
        );
        if (signal.aborted) return;
        submission.current = null;
        setInvalidated(false);
        setAnalysis(null);
        setTargets(targets);
        setPreparation(job);
        remember({
          prepareId: job.job_id,
          targets: targets.map(({ target }) => target),
        });
        onJobSubmitted();
      }),
    analyze: (draft: AnalysisDraft) =>
      run("analyze", async (signal) => {
        if (!workspace || running || analysisExpired) return;
        const input = {
          ...draft,
          workspace_handle: workspace,
          target_handles: targets.map((item) => item.target_handle),
        };
        const job = await analyzePreparedWorkspace(
          threadId,
          input,
          keyFor("analyze", input),
          signal
        );
        if (signal.aborted) return;
        submission.current = null;
        setAnalysis(job);
        if (resume) remember({ ...resume, analysisId: job.job_id });
        onJobSubmitted();
      }),
    release: () =>
      run("release", async (signal) => {
        const result = await releasePreparedWorkspace(threadId, signal);
        if (signal.aborted) return;
        if (
          result.status === "no_workspace" ||
          result.handle_id === workspace
        ) {
          setTargets(targets);
          remember(null);
          setInvalidated(true);
        }
        setNotice(result.message);
      }),
  };
}
