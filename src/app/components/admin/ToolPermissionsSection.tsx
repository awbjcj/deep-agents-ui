"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToolPermissionList } from "@/app/components/tool-permissions/ToolPermissionList";
import { LoadingRow, SectionHeader } from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";
import {
  ToolPermissionsApiError,
  apiGetAdminToolPermissions,
  apiSetTierToolPermissions,
  canSaveToolPermissions,
  mergeRetainedSelection,
  sameToolIds,
  type AdminToolPermissions,
  type ToolTier,
} from "@/lib/tool-permissions";

type TierDrafts = Record<ToolTier, string[]>;

const EMPTY_DRAFTS: TierDrafts = { user: [], developer: [], admin: [] };

export function ToolPermissionsSection() {
  const [snapshot, setSnapshot] = useState<AdminToolPermissions | null>(null);
  const [drafts, setDrafts] = useState<TierDrafts>(EMPTY_DRAFTS);
  const [activeTier, setActiveTier] = useState<ToolTier>("user");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyResolved, setPolicyResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewTier, setReviewTier] = useState<ToolTier | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const snapshotRef = useRef<AdminToolPermissions | null>(null);
  const draftsRef = useRef<TierDrafts>(EMPTY_DRAFTS);
  const draftGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);

  const applyDrafts = useCallback((next: TierDrafts) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const loadPermissions = useCallback(
    async (preserveDirty: boolean) => {
      const generation = ++requestGeneration.current;
      const startedAfterMutation = mutationGeneration.current;
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      if (!snapshotRef.current) setLoading(true);
      setPolicyResolved(false);
      setError(null);
      try {
        const response = await apiGetAdminToolPermissions(controller.signal);
        if (
          generation !== requestGeneration.current ||
          startedAfterMutation !== mutationGeneration.current
        )
          return;
        const previous = snapshotRef.current;
        const currentDrafts = draftsRef.current;
        const nextDrafts = Object.fromEntries(
          ROLES.map((tier) => {
            const keepDirty =
              preserveDirty &&
              previous &&
              !sameToolIds(
                currentDrafts[tier],
                previous.tiers[tier].allowed_tool_ids
              );
            return [
              tier,
              keepDirty
                ? currentDrafts[tier]
                : response.tiers[tier].allowed_tool_ids,
            ];
          })
        ) as TierDrafts;
        snapshotRef.current = response;
        setSnapshot(response);
        applyDrafts(nextDrafts);
        setPolicyResolved(true);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause, "Failed to load tool permissions."));
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [applyDrafts]
  );

  useEffect(() => {
    void loadPermissions(false);
    const refreshOnFocus = () => void loadPermissions(true);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      loadController.current?.abort();
      saveController.current?.abort();
      requestGeneration.current += 1;
    };
  }, [loadPermissions]);

  const savedIds = snapshot?.tiers[activeTier].allowed_tool_ids ?? [];
  const activeDraft = drafts[activeTier];
  const dirty = !sameToolIds(activeDraft, savedIds);
  const canSave = canSaveToolPermissions({
    hasSnapshot: Boolean(snapshot && policyResolved),
    dirty,
    saving,
    policyReviewRequired: reviewTier === activeTier,
  });
  const allCatalogIds = useMemo(
    () => snapshot?.catalog.map((tool) => tool.id) ?? [],
    [snapshot]
  );

  const setActiveDraft = (next: string[]) => {
    draftGeneration.current += 1;
    setSavedNotice(null);
    applyDrafts({ ...draftsRef.current, [activeTier]: next });
  };

  const toggleTool = (toolId: string) => {
    setActiveDraft(
      mergeRetainedSelection(activeDraft, toolId, !activeDraft.includes(toolId))
    );
  };

  const saveActiveTier = async () => {
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot || !canSave) return;
    const baseline = currentSnapshot.tiers[activeTier];
    const submittedDraft = [...draftsRef.current[activeTier]];
    const submittedGeneration = draftGeneration.current;
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const updated = await apiSetTierToolPermissions(
        activeTier,
        submittedDraft,
        baseline.revision,
        controller.signal
      );
      if (controller.signal.aborted) return;
      mutationGeneration.current += 1;
      const latestSnapshot = snapshotRef.current ?? currentSnapshot;
      const nextSnapshot: AdminToolPermissions = {
        ...latestSnapshot,
        tiers: { ...latestSnapshot.tiers, [activeTier]: updated },
      };
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      if (draftGeneration.current === submittedGeneration) {
        applyDrafts({
          ...draftsRef.current,
          [activeTier]: updated.allowed_tool_ids,
        });
      }
      setReviewTier((tier) => (tier === activeTier ? null : tier));
      setPolicyResolved(true);
      setSavedNotice(`${titleCase(activeTier)} tier tools saved.`);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ToolPermissionsApiError && cause.status === 409) {
        await loadPermissions(true);
        setReviewTier(activeTier);
        setError(
          `${cause.message} Your draft is still here. Review the refreshed policy before saving again.`
        );
      } else {
        setError(errorMessage(cause, "Failed to save tool permissions."));
      }
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Agent tools"
        subtitle="Set the maximum tools each account tier may enable"
      />

      <div
        role="radiogroup"
        aria-label="Tool permission tier"
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/35 p-1"
      >
        {ROLES.map((tier) => (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={activeTier === tier}
            onClick={() => setActiveTier(tier)}
            className={`rounded-md px-2 py-2 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              activeTier === tier
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tier}
          </button>
        ))}
      </div>

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
                {reviewTier === activeTier ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setReviewTier(null)}
                  >
                    <CheckCheck className="mr-1.5 h-3.5 w-3.5" />I reviewed the
                    refreshed policy
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
        <LoadingRow />
      ) : snapshot ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {activeDraft.length}
              </span>{" "}
              of {snapshot.catalog.length} selected for {activeTier}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving || sameToolIds(activeDraft, allCatalogIds)}
                onClick={() => setActiveDraft(allCatalogIds)}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving || activeDraft.length === 0}
                onClick={() => setActiveDraft([])}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>

          <ToolPermissionList
            catalog={snapshot.catalog}
            selectedIds={activeDraft}
            allowedIds={allCatalogIds}
            effectiveIds={activeDraft}
            selectedStatusLabel="Allowed"
            idPrefix={`admin-tools-${activeTier}`}
            saving={saving}
            onToggle={toggleTool}
          />

          <Button
            type="button"
            className="w-full"
            disabled={!canSave}
            onClick={() => void saveActiveTier()}
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
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
