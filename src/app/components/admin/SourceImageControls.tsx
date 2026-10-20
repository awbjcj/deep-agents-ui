"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { SourceAttachmentControl } from "@/app/components/admin/SourceAttachmentControl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  graph: "Email and Teams attachments",
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
        `Failed to update ${SOURCE_IMAGE_LABELS[source]} attachment policy`
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
    <div className="rounded-lg border border-border bg-card @container/permissions">
      {SOURCE_IMAGE_SOURCES.map((source) => {
        const row = rows[source];
        const policy = row.current;
        const sourceLabel = SOURCE_IMAGE_LABELS[source];

        return (
          <div
            key={source}
            className="border-t border-border p-3 first:border-t-0"
            role="group"
            aria-label={`${sourceLabel} permissions for ${tier} tier`}
            aria-busy={row.isSaving || row.isLoading}
          >
            {policy ? (
              <div className="grid gap-2 @2xl/permissions:grid-cols-[9rem_minmax(0,1fr)] @2xl/permissions:items-center @2xl/permissions:gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {sourceLabel}
                      {row.isSaving && (
                        <Loader2
                          className="h-3 w-3 animate-spin text-muted-foreground motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {SOURCE_DESCRIPTIONS[source]}
                    </span>
                  </span>
                </div>

                <SourceAttachmentControl
                  tier={tier}
                  source={source}
                  policy={policy}
                  isSaving={row.isSaving}
                  onChange={(edit) => void handleEdit(source, edit)}
                />
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
                className="mt-2 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-xs leading-relaxed text-destructive"
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
                    className="min-h-11 shrink-0 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
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
      <div className="space-y-1 border-t border-border bg-muted/20 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
        <p id={`source-attachment-scope-${tier}`}>
          Scope applies to images and documents. Enable either to edit scope.
          Embedded only fetches files referenced in content. Allow all lets
          users request other attachments.
        </p>
        <details className="group">
          <summary className="min-h-11 cursor-pointer rounded-sm py-3 font-medium text-foreground underline decoration-border underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            File types and limits
          </summary>
          <p id={`source-attachment-images-${tier}`}>
            Images require the user�s image opt-in.
          </p>
          <p id={`source-attachment-documents-${tier}`}>
            Documents are downloaded and converted, up to 10 MB per file.
            Supported: DOCX, HTML, PPTX, XLSX, PDF, and text.
          </p>
        </details>
      </div>
    </div>
  );
}
