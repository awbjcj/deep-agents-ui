"use client";

import { SettingsContent, SettingsFooter } from "./settings/SettingsLayout";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolPermissionList } from "@/app/components/tool-permissions/ToolPermissionList";
import { useAuth } from "@/providers/AuthProvider";
import { CONNECTIVITY_CHANGED_EVENT } from "@/lib/auth";
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
  const accountGeneration = useRef(0);
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
        if (
          keepDirty &&
          (previous.selection_revision !== response.selection_revision ||
            previous.tier_revision !== response.tier_revision ||
            previous.tier !== response.tier)
        ) {
          setPolicyReviewRequired(true);
        }
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
    accountGeneration.current += 1;
    requestGeneration.current += 1;
    loadController.current?.abort();
    saveController.current?.abort();
    snapshotRef.current = null;
    draftRef.current = [];
    setSnapshot(null);
    setDraft([]);
    setSaving(false);
    setPolicyResolved(false);
    setPolicyReviewRequired(false);
    setSavedNotice(null);
    setError(null);
    setLoading(Boolean(accountKey));
    if (accountKey) void loadPermissions(false);

    const refreshOnFocus = () => void loadPermissions(true);
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener(CONNECTIVITY_CHANGED_EVENT, refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener(CONNECTIVITY_CHANGED_EVENT, refreshOnFocus);
      loadController.current?.abort();
      saveController.current?.abort();
      requestGeneration.current += 1;
      accountGeneration.current += 1;
    };
  }, [accountKey, loadPermissions]);

  const dirty = snapshot
    ? !sameToolIds(draft, snapshot.selected_tool_ids)
    : false;
  const availableIds = (snapshot?.allowed_tool_ids ?? []).filter(
    (id) => !snapshot?.unavailable_tools?.[id]
  );
  useSettingsDraft(dirty || saving);
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
    if (!snapshot || snapshot.unavailable_tools?.[toolId]) return;
    const selected = draft.includes(toolId);
    updateDraft(mergeRetainedSelection(draft, toolId, !selected));
  };

  const saveSelection = async () => {
    const baseline = snapshotRef.current;
    if (!baseline || !canSave) return;
    const submittedDraft = [...draftRef.current];
    const submittedGeneration = draftGeneration.current;
    const submittedAccountGeneration = accountGeneration.current;
    const submittedAccountKey = accountKey;
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    const isCurrentSave = () =>
      !controller.signal.aborted &&
      accountGeneration.current === submittedAccountGeneration &&
      accountKey === submittedAccountKey;
    try {
      const response = await apiSetUserToolPermissions(
        submittedDraft,
        baseline.selection_revision,
        baseline.tier_revision,
        controller.signal
      );
      if (!isCurrentSave()) return;
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
      if (!isCurrentSave()) return;
      if (cause instanceof ToolPermissionsApiError && cause.status === 409) {
        await loadPermissions(true);
        if (!isCurrentSave()) return;
        setPolicyReviewRequired(true);
        setError(
          `${cause.message} Your draft is still here. Review the refreshed restrictions before saving again.`
        );
      } else {
        requestGeneration.current += 1;
        loadController.current?.abort();
        setPolicyResolved(false);
        setError(errorMessage(cause, "Failed to save your tool selection."));
      }
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col">
      <ScrollArea className="h-0 flex-1">
        <SettingsContent>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold tracking-tight">
                Account permissions
              </h3>
              {snapshot ? (
                <span className="border-border bg-muted/35 text-muted-foreground rounded-full border px-2 py-1 text-[10px] font-bold tracking-[0.14em] uppercase">
                  {snapshot.tier} tier
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Tool choices apply to every conversation. Approval mode is set
              separately for each conversation.
            </p>
          </header>

          {error ? (
            <div
              role="alert"
              className="border-destructive/35 bg-destructive/10 text-foreground rounded-lg border p-3 text-xs"
            >
              <div className="flex gap-2">
                <AlertTriangle
                  className="text-destructive mt-0.5 h-4 w-4 shrink-0"
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
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {policyReviewRequired ? (
            <div
              role="status"
              className="text-foreground rounded-lg border border-(--aptiv-orange)/35 bg-(--aptiv-orange)/5 p-3 text-xs"
            >
              <p>
                Your tool policy was refreshed. Your unsaved draft is still
                here; review the current restrictions before saving again.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setPolicyReviewRequired(false)}
              >
                <Check
                  className="mr-1.5 h-3.5 w-3.5"
                  aria-hidden="true"
                />
                I reviewed the refreshed restrictions
              </Button>
            </div>
          ) : null}

          {savedNotice ? (
            <p
              role="status"
              className="text-xs text-(--aptiv-turquoise-dark) dark:text-(--aptiv-turquoise)"
            >
              {savedNotice}
            </p>
          ) : null}

          {loading && !snapshot ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            </div>
          ) : snapshot ? (
            <>
              <div className="border-border bg-muted/25 rounded-lg border p-3">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {snapshot.effective_tool_ids.length} active
                  {snapshot.blocked_tool_ids.length > 0 &&
                    ` · ${snapshot.blocked_tool_ids.length} blocked by your administrator`}
                  {Object.keys(snapshot.unavailable_tools ?? {}).length > 0
                    ? ` · ${
                        Object.keys(snapshot.unavailable_tools ?? {}).length
                      } unavailable in ${snapshot.connection_mode} mode`
                    : ""}
                </p>
              </div>

              {snapshot.selected_tool_ids.length === 0 && draft.length === 0 ? (
                <div className="border-border bg-card/50 rounded-lg border border-dashed px-4 py-5 text-center">
                  <p className="text-sm font-semibold">
                    {snapshot.allowed_tool_ids.length === 0
                      ? "No tools available for your tier"
                      : "No tools selected yet"}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground font-semibold">
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
                      saving || availableIds.every((id) => draft.includes(id))
                    }
                    onClick={() =>
                      updateDraft(
                        [...new Set([...draft, ...availableIds])].sort()
                      )
                    }
                  >
                    <Check
                      className="mr-1.5 h-3.5 w-3.5"
                      aria-hidden="true"
                    />
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
                effectiveIds={snapshot.effective_tool_ids}
                unavailableTools={snapshot.unavailable_tools}
                idPrefix={`personal-tools-${accountKey}`}
                saving={saving}
                onToggle={toggleTool}
              />
            </>
          ) : null}
        </SettingsContent>
      </ScrollArea>
      <SettingsFooter>
        <p
          role="status"
          className="text-muted-foreground m-0 text-xs leading-relaxed"
        >
          {saving
            ? "Saving tool choices…"
            : dirty
              ? "You have unsaved tool choices."
              : "Tool choices apply to every conversation."}
        </p>
        <Button
          type="button"
          className="min-h-touch w-full"
          disabled={!canSave}
          onClick={() => void saveSelection()}
        >
          {saving ? (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Save
              className="size-4"
              aria-hidden="true"
            />
          )}
          {saving ? "Saving" : "Save changes"}
        </Button>
      </SettingsFooter>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
