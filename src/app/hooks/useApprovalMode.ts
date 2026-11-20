"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetProfile } from "@/lib/auth";
import {
  buildAutopilotResume,
  buildReadOnlyResume,
  canUseAutopilot,
  type AutopilotInterrupt,
} from "@/lib/autopilot";
import {
  APPROVAL_MODE_COPY,
  apiGetApprovalPolicy,
  type ApprovalMode,
  type AutomaticApprovalMode,
} from "@/lib/approval-modes";
import type { ResumeInterruptValue } from "@/app/types/types";

interface ApprovalModeOptions {
  scope: string;
  connection?: object;
  accountId?: string;
  role?: string;
  ready: boolean;
  busy: boolean;
  failed: boolean;
  pending: readonly AutopilotInterrupt[];
  submit: (
    resume: Record<string, ResumeInterruptValue>,
    mode: AutomaticApprovalMode,
    signal: AbortSignal
  ) => Promise<boolean | readonly string[] | void>;
}

interface ModeState {
  scope: string;
  connection?: object;
  mode: ApprovalMode;
  checking: AutomaticApprovalMode | null;
}

/**
 * A notice explaining why automation is off or a mode change was refused.
 *
 * `resolves` notices describe a blocking condition (a run error or an
 * unconfirmed automatic approval) and clear by themselves once it is gone.
 * Other notices stay until the user picks a mode or decides manually.
 */
interface ModeNotice {
  message: string;
  resolves: boolean;
}

const label = (mode: AutomaticApprovalMode) => APPROVAL_MODE_COPY[mode].label;

/** Re-verify that the signed-in account may still use Autopilot. */
async function checkAutopilotAccess(signal: AbortSignal, accountId?: string) {
  const profile = await apiGetProfile(signal);
  if (profile.user_id !== accountId || !canUseAutopilot(profile.role)) {
    throw new Error(
      "Autopilot is available only to administrators and developers."
    );
  }
}

/**
 * Hold the conversation's approval mode and resolve reviews it covers.
 *
 * The mode is scoped to the mounted conversation, account, and connection and
 * resets to Interactive when any of them change. Allow reads approves only
 * reviews whose actions are all server-classified read tools; everything else
 * stays pending for the user. Autopilot re-verifies the account's role before
 * each batch. Any failure returns to Interactive, and no request is retried.
 *
 * An automatic approval whose outcome was not confirmed stays claimed: while
 * it is still pending, neither automatic mode can be turned on again until
 * the user resolves it manually. The resulting notice clears on its own once
 * the claimed review and any run error are gone.
 */
export function useApprovalMode(options: ApprovalModeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [state, setState] = useState<ModeState>({
    scope: options.scope,
    connection: options.connection,
    mode: "interactive",
    checking: null,
  });
  const [notice, setNotice] = useState<ModeNotice | null>(null);
  const setError = useCallback(
    (message: string | null, resolves = false) =>
      setNotice(message === null ? null : { message, resolves }),
    []
  );
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const selection = useRef<AbortController | null>(null);
  const submitted = useRef(new Set<string>());
  const readTools = useRef<ReadonlySet<string> | null>(null);
  const canAutopilot = canUseAutopilot(options.role);
  const current =
    state.scope === options.scope && state.connection === options.connection;
  const mode: ApprovalMode =
    current && (state.mode !== "autopilot" || canAutopilot)
      ? state.mode
      : "interactive";
  const checking = current ? state.checking : null;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /** Cancel queued or in-flight automatic approvals without changing mode. */
  const abortAutomation = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);

  /** Abandon a pending mode change; the current mode stays active. */
  const cancel = useCallback(() => {
    selection.current?.abort();
    selection.current = null;
    setState((prev) => ({ ...prev, checking: null }));
  }, []);

  const apply = useCallback(
    (next: ApprovalMode) => {
      abortAutomation();
      setState({
        scope: latest.current.scope,
        connection: latest.current.connection,
        mode: next,
        checking: null,
      });
    },
    [abortAutomation]
  );

  /** Return to Interactive and cancel all automatic work. */
  const reset = useCallback(() => {
    selection.current?.abort();
    selection.current = null;
    apply("interactive");
  }, [apply]);

  useEffect(() => {
    reset();
    submitted.current.clear();
    readTools.current = null;
    setError(null);
    return () => {
      selection.current?.abort();
      abortAutomation();
    };
  }, [
    options.scope,
    options.connection,
    canAutopilot,
    reset,
    abortAutomation,
    setError,
  ]);

  /** Whether an unconfirmed automatic approval is still awaiting review. */
  const hasUnconfirmed = useCallback(
    (pending: readonly AutopilotInterrupt[]) =>
      pending.some((item) => item.id && submitted.current.has(item.id)),
    []
  );

  const select = useCallback(
    async (next: ApprovalMode) => {
      if (next === "interactive") {
        reset();
        setError(null);
        return true;
      }
      const start = latest.current;
      if (
        !start.ready ||
        !start.accountId ||
        (next === "autopilot" && !canUseAutopilot(start.role))
      )
        return false;
      if (modeRef.current === next) return true;
      // Leaving Autopilot must never wait on the server: stop automatic
      // approvals first so writes ask again even if the new mode fails.
      if (modeRef.current === "autopilot") reset();
      setError(null);
      if (start.failed) {
        setError(
          `Resolve the conversation error before turning on ${label(
            next
          )}. Manual approval remains on.`,
          true
        );
        return false;
      }
      if (hasUnconfirmed(start.pending)) {
        setError(
          `An earlier automatic approval is still pending. Review it manually before turning on ${label(
            next
          )}.`,
          true
        );
        return false;
      }
      selection.current?.abort();
      const controller = new AbortController();
      selection.current = controller;
      setState((prev) => ({
        scope: start.scope,
        connection: start.connection,
        mode:
          prev.scope === start.scope && prev.connection === start.connection
            ? prev.mode
            : "interactive",
        checking: next,
      }));
      try {
        let tools: ReadonlySet<string> | null = null;
        if (next === "autopilot") {
          await checkAutopilotAccess(controller.signal, start.accountId);
        } else {
          const policy = await apiGetApprovalPolicy(controller.signal);
          if (!policy.available_modes.includes("allow_read"))
            throw new Error("Allow reads isn't available for this account.");
          tools = new Set(policy.read_tools);
        }
        if (
          controller.signal.aborted ||
          selection.current !== controller ||
          start.scope !== latest.current.scope ||
          start.connection !== latest.current.connection
        )
          return false;
        selection.current = null;
        if (tools) readTools.current = tools;
        apply(next);
        return true;
      } catch (cause) {
        if (selection.current === controller && !controller.signal.aborted) {
          selection.current = null;
          setState((prev) => ({ ...prev, checking: null }));
          setError(
            cause instanceof Error
              ? cause.message
              : `Could not turn on ${label(next)}.`
          );
        }
        return false;
      }
    },
    [apply, reset, setError, hasUnconfirmed]
  );

  /**
   * A manual decision ends Autopilot; Allow reads keeps covering reads.
   * The user now owns the reviewed IDs, so they no longer block automation.
   * Returns the mode in effect for the run that carries the decision.
   */
  const onManualResume = useCallback(
    (ids: readonly string[] = []): ApprovalMode => {
      ids.forEach((id) => submitted.current.delete(id));
      setError(null);
      if (selection.current) {
        selection.current.abort();
        selection.current = null;
        setState((previous) => ({ ...previous, checking: null }));
      }
      if (modeRef.current === "autopilot") {
        reset();
        return "interactive";
      }
      abortAutomation();
      return modeRef.current;
    },
    [abortAutomation, reset, setError]
  );

  const automatic: AutomaticApprovalMode | null =
    mode === "interactive" ? null : mode;

  // Depend on the payload, not the SDK array identity, to avoid postponing the
  // same approval on unrelated renders. IDs stay claimed until the scope ends
  // or the user decides them manually.
  const pendingKey = JSON.stringify(options.pending);

  // Clear a condition notice once the run error and unconfirmed review are gone.
  useEffect(() => {
    if (
      notice?.resolves &&
      !options.failed &&
      !hasUnconfirmed(latest.current.pending)
    )
      setNotice(null);
  }, [notice, options.failed, pendingKey, hasUnconfirmed]);

  useEffect(() => {
    if (!automatic) return;
    if (options.failed) {
      reset();
      setError(
        `${label(
          automatic
        )} stopped after an error. Review the conversation before turning it on again.`,
        true
      );
      return;
    }
    if (!options.ready || options.busy || latest.current.pending.length === 0)
      return;
    const version = generation.current;
    const scope = options.scope;
    const connection = options.connection;
    const controller = new AbortController();
    let didSubmit = false;
    const timer = setTimeout(async () => {
      request.current = controller;
      try {
        const candidates = latest.current.pending.filter(
          (item) => !item.id || !submitted.current.has(item.id)
        );
        if (candidates.length === 0) return;
        let resume: Record<string, ResumeInterruptValue>;
        if (automatic === "autopilot") {
          resume = buildAutopilotResume(candidates);
          await checkAutopilotAccess(
            controller.signal,
            latest.current.accountId
          );
        } else {
          if (!readTools.current) return;
          resume = buildReadOnlyResume(candidates, readTools.current);
          if (Object.keys(resume).length === 0) return;
        }
        if (
          controller.signal.aborted ||
          version !== generation.current ||
          scope !== latest.current.scope ||
          connection !== latest.current.connection ||
          latest.current.busy ||
          !latest.current.ready ||
          latest.current.failed ||
          (automatic === "autopilot" &&
            !canUseAutopilot(latest.current.role)) ||
          JSON.stringify(latest.current.pending) !== pendingKey
        )
          return;
        Object.keys(resume).forEach((id) => submitted.current.add(id));
        didSubmit = true;
        const dispatched = await latest.current.submit(
          resume,
          automatic,
          controller.signal
        );
        if (dispatched === false || Array.isArray(dispatched)) {
          Object.keys(resume).forEach((id) => {
            if (!Array.isArray(dispatched) || !dispatched.includes(id))
              submitted.current.delete(id);
          });
        }
      } catch (cause) {
        if (
          version === generation.current &&
          scope === latest.current.scope &&
          connection === latest.current.connection &&
          (didSubmit || !controller.signal.aborted)
        ) {
          reset();
          // A dispatched approval keeps its claim, so its notice lasts until
          // that review is resolved; a refusal before dispatch stays visible.
          setError(
            cause instanceof Error
              ? cause.message
              : `Automatic approval failed. ${label(automatic)} is off.`,
            didSubmit
          );
        }
      } finally {
        if (request.current === controller) request.current = null;
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      if (!didSubmit) controller.abort();
    };
  }, [
    automatic,
    options.scope,
    options.connection,
    options.ready,
    options.busy,
    options.failed,
    pendingKey,
    reset,
    setError,
  ]);

  const error = notice?.message ?? null;
  return useMemo(
    () => ({
      mode,
      checking,
      error,
      canAutopilot,
      select,
      cancel,
      reset,
      onManualResume,
    }),
    [mode, checking, error, canAutopilot, select, cancel, reset, onManualResume]
  );
}

export type ApprovalModeState = ReturnType<typeof useApprovalMode>;
