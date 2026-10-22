"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetProfile } from "@/lib/auth";
import {
  buildAutopilotResume,
  canUseAutopilot,
  type AutopilotInterrupt,
} from "@/lib/autopilot";
import type { ResumeInterruptValue } from "@/app/types/types";

interface AutopilotOptions {
  scope: string;
  connection?: object;
  accountId?: string;
  role?: string;
  ready: boolean;
  busy: boolean;
  failed: boolean;
  pending: readonly AutopilotInterrupt[];
  submit: (resume: Record<string, ResumeInterruptValue>) => Promise<void>;
}

/** Keep consent in this mounted conversation and cancel queued approvals on opt-out. */
export function useAutopilot(options: AutopilotOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [mode, setMode] = useState<{
    scope: string;
    connection?: object;
    status: "off" | "checking" | "on";
  }>({ scope: options.scope, connection: options.connection, status: "off" });
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const submitted = useRef(new Set<string>());
  const eligible = canUseAutopilot(options.role);
  const enabled =
    eligible &&
    mode.scope === options.scope &&
    mode.connection === options.connection &&
    mode.status === "on";
  const checking =
    eligible &&
    mode.scope === options.scope &&
    mode.connection === options.connection &&
    mode.status === "checking";

  const disable = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    setMode({
      scope: latest.current.scope,
      connection: latest.current.connection,
      status: "off",
    });
  }, []);

  useEffect(() => {
    disable();
    submitted.current.clear();
    setError(null);
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [options.scope, options.connection, eligible, disable]);

  const checkAccess = useCallback(
    async (signal: AbortSignal, accountId?: string) => {
      const profile = await apiGetProfile(signal);
      if (profile.user_id !== accountId || !canUseAutopilot(profile.role)) {
        throw new Error(
          "Autopilot is available only to administrators and developers."
        );
      }
    },
    []
  );

  const enable = useCallback(async () => {
    const current = latest.current;
    if (!current.ready || !canUseAutopilot(current.role) || !current.accountId)
      return false;
    disable();
    setError(null);
    if (current.failed) {
      setError(
        "Resolve the conversation error before enabling autopilot. Manual approval remains on."
      );
      return false;
    }
    if (
      current.pending.some((item) => item.id && submitted.current.has(item.id))
    ) {
      setError(
        "An earlier automatic approval is still pending. Review it manually before enabling autopilot again."
      );
      return false;
    }
    const version = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setMode({
      scope: current.scope,
      connection: current.connection,
      status: "checking",
    });
    try {
      await checkAccess(controller.signal, current.accountId);
      if (
        controller.signal.aborted ||
        version !== generation.current ||
        current.scope !== latest.current.scope ||
        current.connection !== latest.current.connection
      )
        return false;
      setMode({
        scope: current.scope,
        connection: current.connection,
        status: "on",
      });
      return true;
    } catch (cause) {
      if (version === generation.current && !controller.signal.aborted) {
        disable();
        setError(
          cause instanceof Error ? cause.message : "Could not enable autopilot."
        );
      }
      return false;
    }
  }, [checkAccess, disable]);

  // Depend on the payload, not the SDK array identity, to avoid postponing the
  // same approval on unrelated renders. IDs stay claimed until the scope ends.
  const pendingKey = JSON.stringify(options.pending);
  useEffect(() => {
    if (!enabled) return;
    if (options.failed) {
      disable();
      setError(
        "Autopilot stopped after an error. Review the conversation before enabling it again."
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
        const resume = buildAutopilotResume(candidates);
        await checkAccess(controller.signal, latest.current.accountId);
        if (
          controller.signal.aborted ||
          version !== generation.current ||
          scope !== latest.current.scope ||
          connection !== latest.current.connection ||
          latest.current.busy ||
          !latest.current.ready ||
          latest.current.failed ||
          !canUseAutopilot(latest.current.role) ||
          JSON.stringify(latest.current.pending) !== pendingKey
        )
          return;
        Object.keys(resume).forEach((id) => submitted.current.add(id));
        didSubmit = true;
        await latest.current.submit(resume);
      } catch (cause) {
        if (
          version === generation.current &&
          scope === latest.current.scope &&
          connection === latest.current.connection &&
          (didSubmit || !controller.signal.aborted)
        ) {
          disable();
          setError(
            cause instanceof Error
              ? cause.message
              : "Automatic approval failed. Autopilot is off."
          );
        }
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    enabled,
    options.scope,
    options.connection,
    options.ready,
    options.busy,
    options.failed,
    pendingKey,
    checkAccess,
    disable,
  ]);

  return useMemo(
    () => ({ eligible, enabled, checking, error, enable, disable }),
    [eligible, enabled, checking, error, enable, disable]
  );
}
