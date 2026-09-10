"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  fetchTierSourceImagePolicy,
  updateTierSourceImagePolicy,
} from "@/lib/auth";
import {
  applyPolicyEdit,
  SOURCE_IMAGE_LABELS,
  SOURCE_IMAGE_SOURCES,
  type SourceImagePolicyEdit,
  type SourceImagePolicyResponse,
  type SourceImageSource,
} from "@/lib/source-images";

interface PolicyRowState {
  confirmed: SourceImagePolicyResponse | null;
  current: SourceImagePolicyResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

type PolicyRows = Record<SourceImageSource, PolicyRowState>;

const SOURCE_DESCRIPTIONS: Record<SourceImageSource, string> = {
  jira: "Issue content",
  polarion: "Work item content",
  confluence: "Page content",
};

function loadingRows(): PolicyRows {
  return Object.fromEntries(
    SOURCE_IMAGE_SOURCES.map((source) => [
      source,
      {
        confirmed: null,
        current: null,
        isLoading: true,
        isSaving: false,
        error: null,
      },
    ])
  ) as PolicyRows;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SourceImageControls({ tier }: { tier: string }) {
  const [rows, setRows] = useState<PolicyRows>(loadingRows);
  const generationRef = useRef(0);
  const tierRef = useRef(tier);
  tierRef.current = tier;

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    setRows(loadingRows());

    for (const source of SOURCE_IMAGE_SOURCES) {
      fetchTierSourceImagePolicy(tier, source, controller.signal)
        .then((policy) => {
          if (
            tierRef.current !== tier ||
            generationRef.current !== generation
          ) {
            return;
          }
          setRows((previous) => ({
            ...previous,
            [source]: {
              confirmed: policy,
              current: policy,
              isLoading: false,
              isSaving: false,
              error: null,
            },
          }));
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            tierRef.current !== tier ||
            generationRef.current !== generation
          ) {
            return;
          }
          setRows((previous) => ({
            ...previous,
            [source]: {
              ...previous[source],
              isLoading: false,
              error: errorMessage(error, `Failed to load ${source} policy`),
            },
          }));
        });
    }

    return () => controller.abort();
  }, [tier]);

  const retrySource = async (source: SourceImageSource) => {
    const generation = generationRef.current;
    setRows((previous) => ({
      ...previous,
      [source]: {
        ...previous[source],
        isLoading: true,
        error: null,
      },
    }));
    try {
      const policy = await fetchTierSourceImagePolicy(tier, source);
      if (tierRef.current !== tier || generationRef.current !== generation) {
        return;
      }
      setRows((previous) => ({
        ...previous,
        [source]: {
          confirmed: policy,
          current: policy,
          isLoading: false,
          isSaving: false,
          error: null,
        },
      }));
    } catch (error) {
      if (tierRef.current !== tier || generationRef.current !== generation) {
        return;
      }
      setRows((previous) => ({
        ...previous,
        [source]: {
          ...previous[source],
          isLoading: false,
          error: errorMessage(error, `Failed to load ${source} policy`),
        },
      }));
    }
  };

  const handleEdit = async (
    source: SourceImageSource,
    edit: SourceImagePolicyEdit
  ) => {
    const row = rows[source];
    if (
      !row.current ||
      !row.confirmed ||
      row.current.tier !== tier ||
      row.confirmed.tier !== tier ||
      row.isSaving
    ) {
      return;
    }

    const generation = generationRef.current;
    const nextPolicy = applyPolicyEdit(row.current, edit);
    const nextRow = { ...row.current, ...nextPolicy };
    setRows((previous) => ({
      ...previous,
      [source]: {
        ...previous[source],
        current: nextRow,
        isSaving: true,
        error: null,
      },
    }));

    try {
      const saved = await updateTierSourceImagePolicy(tier, source, nextPolicy);
      if (tierRef.current !== tier || generationRef.current !== generation) {
        return;
      }
      setRows((previous) => ({
        ...previous,
        [source]: {
          confirmed: saved,
          current: saved,
          isLoading: false,
          isSaving: false,
          error: null,
        },
      }));
    } catch (error) {
      if (tierRef.current !== tier || generationRef.current !== generation) {
        return;
      }
      const message = errorMessage(
        error,
        `Failed to update ${SOURCE_IMAGE_LABELS[source]} image policy`
      );
      setRows((previous) => ({
        ...previous,
        [source]: {
          ...previous[source],
          current: previous[source].confirmed,
          isSaving: false,
          error: message,
        },
      }));
      toast.error(message);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
      <div
        aria-hidden="true"
        className="hidden min-[440px]:grid min-[440px]:grid-cols-[minmax(108px,1fr)_64px_minmax(116px,1fr)_76px] min-[440px]:items-center min-[440px]:gap-3 min-[440px]:border-b min-[440px]:border-border/60 min-[440px]:bg-muted/35 min-[440px]:px-3 min-[440px]:py-2"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Source
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Enabled
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Default fetch
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Allow all
        </span>
      </div>
      {SOURCE_IMAGE_SOURCES.map((source) => {
        const row = rows[source];
        const policy = row.current;
        const sourceLabel = SOURCE_IMAGE_LABELS[source];
        const idBase = `source-images-${tier}-${source}`;

        return (
          <div
            key={source}
            className="border-t border-border/60 p-3 first:border-t-0 min-[440px]:first:border-t-0"
            aria-busy={row.isSaving || row.isLoading}
          >
            {policy ? (
              <div className="grid grid-cols-2 items-end gap-x-4 gap-y-3 min-[440px]:grid-cols-[minmax(108px,1fr)_64px_minmax(116px,1fr)_76px] min-[440px]:items-center min-[440px]:gap-3">
                <div className="col-span-2 flex min-w-0 items-center gap-2.5 min-[440px]:col-span-1">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-[10px] font-bold text-foreground"
                    aria-hidden="true"
                  >
                    {sourceLabel.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      {sourceLabel}
                      {row.isSaving && (
                        <Loader2
                          className="h-3 w-3 animate-spin text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {SOURCE_DESCRIPTIONS[source]}
                    </span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`${idBase}-enabled`}
                    className="text-[10px] font-semibold text-muted-foreground min-[440px]:sr-only"
                  >
                    Enabled
                  </Label>
                  <div className="flex h-8 items-center">
                    <Switch
                      id={`${idBase}-enabled`}
                      checked={policy.enabled}
                      onCheckedChange={(value) =>
                        void handleEdit(source, {
                          field: "enabled",
                          value,
                        })
                      }
                      disabled={row.isSaving}
                      aria-label={`${sourceLabel} source images for ${tier} tier`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`${idBase}-default`}
                    className="text-[10px] font-semibold text-muted-foreground min-[440px]:sr-only"
                  >
                    Default fetch
                  </Label>
                  <Select
                    value={policy.default_scope}
                    onValueChange={(value: "embedded" | "all") =>
                      void handleEdit(source, {
                        field: "default_scope",
                        value,
                      })
                    }
                    disabled={!policy.enabled || row.isSaving}
                  >
                    <SelectTrigger
                      id={`${idBase}-default`}
                      className="h-8 min-w-0 border-border/70 bg-background px-2.5 text-xs shadow-none"
                      aria-label={`Default ${sourceLabel} image fetch for ${tier} tier`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="embedded">Embedded</SelectItem>
                      <SelectItem value="all">All attachments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`${idBase}-allow-all`}
                    className="text-[10px] font-semibold leading-tight text-muted-foreground min-[440px]:sr-only"
                  >
                    Allow all attachments
                  </Label>
                  <div className="flex h-8 items-center">
                    <Switch
                      id={`${idBase}-allow-all`}
                      checked={policy.allow_all}
                      onCheckedChange={(value) =>
                        void handleEdit(source, {
                          field: "allow_all",
                          value,
                        })
                      }
                      disabled={!policy.enabled || row.isSaving}
                      aria-label={`Allow ${tier} users to fetch all ${sourceLabel} images`}
                    />
                  </div>
                </div>
              </div>
            ) : row.isLoading ? (
              <div
                role="status"
                className="flex h-12 items-center gap-3"
              >
                <Skeleton className="h-8 w-8 shrink-0 motion-reduce:animate-none" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20 motion-reduce:animate-none" />
                  <Skeleton className="h-2.5 w-32 motion-reduce:animate-none" />
                </div>
                <span className="sr-only">Loading {sourceLabel} policy</span>
              </div>
            ) : null}

            {row.error && (
              <div
                role="alert"
                className="mt-2 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-[11px] leading-relaxed text-destructive"
              >
                <AlertCircle
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{row.error}</span>
                {!policy && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void retrySource(source)}
                    className="h-7 shrink-0 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <RefreshCw aria-hidden="true" />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
