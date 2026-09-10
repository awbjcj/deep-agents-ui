"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
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
    <div className="space-y-2.5">
      {SOURCE_IMAGE_SOURCES.map((source) => {
        const row = rows[source];
        const policy = row.current;
        const sourceLabel = SOURCE_IMAGE_LABELS[source];
        const idBase = `source-images-${tier}-${source}`;

        return (
          <div
            key={source}
            className="rounded-lg border border-border/60 bg-background/55 p-3"
            aria-busy={row.isSaving}
          >
            <div className="mb-3 flex min-h-5 items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {sourceLabel}
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Images from {sourceLabel} content for the {tier} tier
                </p>
              </div>
              {(row.isLoading || row.isSaving) && (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>

            {policy ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(84px,0.7fr)_minmax(150px,1.3fr)_minmax(180px,1.4fr)] sm:items-end">
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`${idBase}-enabled`}
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    Enabled
                  </Label>
                  <div className="flex h-9 items-center">
                    <Switch
                      id={`${idBase}-enabled`}
                      className="data-[state=unchecked]:border-muted-foreground/45 data-[state=unchecked]:bg-muted/80 data-[state=unchecked]:shadow-inner"
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
                    className="text-[10px] font-semibold text-muted-foreground"
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
                      className="h-9 text-xs"
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
                    className="text-[10px] font-semibold leading-tight text-muted-foreground"
                  >
                    Allow users to fetch all
                  </Label>
                  <div className="flex h-9 items-center">
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
              <p className="text-[11px] text-muted-foreground">
                Loading policy…
              </p>
            ) : null}

            {row.error && (
              <p
                role="alert"
                className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive"
              >
                <AlertCircle
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                <span>{row.error}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
