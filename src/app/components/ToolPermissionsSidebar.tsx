"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolPermissionList } from "@/app/components/tool-permissions/ToolPermissionList";
import { useAuth } from "@/providers/AuthProvider";
import {
  ToolPermissionsApiError,
  apiGetUserToolPermissions,
  apiSetUserToolPermissions,
  canSaveToolPermissions,
  mergeRetainedSelection,
  sameToolIds,
  type UserToolPermissions,
} from "@/lib/tool-permissions";

export function ToolPermissionsSidebar() {
  const { user } = useAuth();
  const accountKey = user?.user_id ?? "";
  const [snapshot, setSnapshot] = useState<UserToolPermissions | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyResolved, setPolicyResolved] = useState(false);
  const [policyReviewRequired, setPolicyReviewRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const snapshotRef = useRef<UserToolPermissions | null>(null);
  const draftRef = useRef<string[]>([]);
  const draftGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);

  const applyDraft = useCallback((next: string[]) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const loadPermissions = useCallback(
    async (preserveDirty: boolean) => {
      if (!accountKey) return;
      const generation = ++requestGeneration.current;
      const startedAfterMutation = mutationGeneration.current;
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      if (!snapshotRef.current) setLoading(true);
      setPolicyResolved(false);
      setError(null);
      try {
        const response = await apiGetUserToolPermissions(controller.signal);
        if (
          generation !== requestGeneration.current ||
          startedAfterMutation !== mutationGeneration.current
        )
          return;
        const previous = snapshotRef.current;
        const keepDirty =
          preserveDirty &&
          previous &&
          !sameToolIds(draftRef.current, previous.selected_tool_ids);
        snapshotRef.current = response;
        setSnapshot(response);
        if (!keepDirty) applyDraft(response.selected_tool_ids);
        setPolicyResolved(true);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause, "Failed to load your tool permissions."));
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [accountKey, applyDraft]
  );

  useEffect(() => {
    requestGeneration.current += 1;
    loadController.current?.abort();
    saveController.current?.abort();
    snapshotRef.current = null;
    draftRef.current = [];
    setSnapshot(null);
    setDraft([]);
    setPolicyResolved(false);
    setPolicyReviewRequired(false);
    setSavedNotice(null);
    setError(null);
    setLoading(Boolean(accountKey));
    if (accountKey) void loadPermissions(false);

    const refreshOnFocus = () => void loadPermissions(true);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      loadController.current?.abort();
      saveController.current?.abort();
      requestGeneration.current += 1;
    };
  }, [accountKey, loadPermissions]);

  const dirty = snapshot
    ? !sameToolIds(draft, snapshot.selected_tool_ids)
    : false;
  const canSave = canSaveToolPermissions({
    hasSnapshot: Boolean(snapshot && policyResolved),
    dirty,
    saving,
    policyReviewRequired,
  });

  const updateDraft = (next: string[]) => {
    draftGeneration.current += 1;
    setSavedNotice(null);
    applyDraft(next);
  };

  const toggleTool = (toolId: string) => {
    if (!snapshot) return;
    const selected = draft.includes(toolId);
    updateDraft(mergeRetainedSelection(draft, toolId, !selected));
  };

  const saveSelection = async () => {
    const baseline = snapshotRef.current;
    if (!baseline || !canSave) return;
    const submittedDraft = [...draftRef.current];
    const submittedGeneration = draftGeneration.current;
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const response = await apiSetUserToolPermissions(
        submittedDraft,
        baseline.selection_revision,
        baseline.tier_revision,
        controller.signal
      );
      if (controller.signal.aborted) return;
      mutationGeneration.current += 1;
      snapshotRef.current = response;
      setSnapshot(response);
      if (draftGeneration.current === submittedGeneration) {
        applyDraft(response.selected_tool_ids);
      }
      setPolicyResolved(true);
      setPolicyReviewRequired(false);
      setSavedNotice("Your account-wide tool selection was saved.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ToolPermissionsApiError && cause.status === 409) {
        await loadPermissions(true);
        setPolicyReviewRequired(true);
        setError(
          `${cause.message} Your draft is still here. Review the refreshed restrictions before saving again.`
        );
      } else {
        setError(errorMessage(cause, "Failed to save your tool selection."));
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="min-w-0 space-y-5 p-5">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              My agent tools
            </h3>
            {snapshot ? (
              <span className="rounded-full border border-border bg-muted/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {snapshot.tier} tier
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Choose the tools available to your account in every conversation.
            Actions that require approval will still ask before they run.
          </p>
          <span
            className="aptiv-rule"
            aria-hidden="true"
          />
        </header>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <div className="flex gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p>{error}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!policyResolved ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadPermissions(true)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  ) : null}
                  {policyReviewRequired ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPolicyReviewRequired(false)}
                    >
                      <CheckCheck className="mr-1.5 h-3.5 w-3.5" />I reviewed
                      the refreshed restrictions
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {savedNotice ? (
          <p
            role="status"
            className="text-xs text-[var(--aptiv-turquoise-dark)] dark:text-[var(--aptiv-turquoise)]"
          >
            {savedNotice}
          </p>
        ) : null}

        {loading && !snapshot ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : snapshot ? (
          <>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs font-semibold text-foreground">
                Saved for your account
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {snapshot.selected_tool_ids.length} selected ·{" "}
                {snapshot.effective_tool_ids.length} active ·{" "}
                {snapshot.blocked_tool_ids.length} blocked by your administrator
              </p>
            </div>

            {snapshot.selected_tool_ids.length === 0 && draft.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-5 text-center">
                <p className="text-sm font-semibold">
                  {snapshot.allowed_tool_ids.length === 0
                    ? "No tools available for your tier"
                    : "No tools selected yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {snapshot.allowed_tool_ids.length === 0
                    ? "An administrator must allow tools before you can select them."
                    : "Select available tools to opt in for this account."}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {draft.length}
                </span>{" "}
                in this draft
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    saving ||
                    snapshot.allowed_tool_ids.every((id) => draft.includes(id))
                  }
                  onClick={() =>
                    updateDraft(
                      [
                        ...new Set([...draft, ...snapshot.allowed_tool_ids]),
                      ].sort()
                    )
                  }
                >
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                  Select available
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving || draft.length === 0}
                  onClick={() => updateDraft([])}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>
            </div>

            <ToolPermissionList
              catalog={snapshot.catalog}
              selectedIds={draft}
              allowedIds={snapshot.allowed_tool_ids}
              effectiveIds={draft.filter((id) =>
                snapshot.allowed_tool_ids.includes(id)
              )}
              idPrefix={`personal-tools-${accountKey}`}
              saving={saving}
              onToggle={toggleTool}
            />

            <Button
              type="button"
              className="w-full"
              disabled={!canSave}
              onClick={() => void saveSelection()}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving" : "Save changes"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="w-full"
            disabled
          >
            <Save className="mr-2 h-4 w-4" />
            Save changes
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
