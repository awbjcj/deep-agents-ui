"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  analysisBlockerMessage,
  type AnalysisEngine,
  type EngineCatalog,
} from "@/lib/code-analysis";
import type { ResolvedTarget } from "@/lib/code-workspace";
import { fieldClass, WorkspaceSelect } from "./WorkspaceFields";
import { AnalysisOptions } from "./AnalysisOptions";
import type { AnalysisDraft, AnalysisFormDraft, DraftSetter } from "./types";

const engineLabels: Record<AnalysisEngine, string> = {
  deep_agent: "Deep Agent",
  copilot: "Copilot",
};

export function WorkspaceAnalysisForm({
  id,
  targets,
  catalog,
  catalogError,
  onRetryCatalog,
  disabled,
  draft,
  onDraftChange,
  onAnalyze,
}: {
  id: string;
  targets: ResolvedTarget[];
  catalog: EngineCatalog | null;
  catalogError: string | null;
  onRetryCatalog: () => void;
  disabled: boolean;
  draft: AnalysisFormDraft;
  onDraftChange: DraftSetter<AnalysisFormDraft>;
  onAnalyze: (draft: AnalysisDraft) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectedEngine = catalog?.engines.find(
    ({ id }) => id === (draft.engine || catalog.default_engine)
  );
  const invalid = (message: string) => {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };
  return (
    <form
      id={id}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          disabled ||
          !draft.question.trim() ||
          (catalog && !selectedEngine?.ready)
        )
          return;
        const handles = new Set(
          targets.map(({ target_handle }) => target_handle)
        );
        const comparisons = draft.pairs.map(({ base, target }) => ({
          base_handle: base,
          target_handle: target,
        }));
        if (
          comparisons.some(
            ({ base_handle, target_handle }) =>
              !handles.has(base_handle) ||
              !handles.has(target_handle) ||
              base_handle === target_handle
          )
        )
          return invalid(
            "Choose two different prepared revisions for each comparison."
          );
        if (
          new Set(
            comparisons.map(({ base_handle, target_handle }) =>
              JSON.stringify([base_handle, target_handle])
            )
          ).size !== comparisons.length
        )
          return invalid(
            "Remove duplicate comparison pairs before running analysis."
          );
        const lines = draft.checklist
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length > 32)
          return invalid("Enter no more than 32 checklist questions.");
        setError(null);
        onAnalyze({
          question: draft.question.trim(),
          engine: draft.engine || undefined,
          comparisons,
          questions: lines.length
            ? lines.map((question, index) => ({
                id: `Q${index + 1}`,
                question,
              }))
            : undefined,
        });
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">
          What would you like to investigate?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ask a question across the selected repositories. Findings will cite
          the prepared revisions.
        </p>
      </div>
      {error && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none"
        >
          {error}
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <Label htmlFor={`${id}-question`}>Analysis question</Label>
        <Textarea
          id={`${id}-question`}
          className={`${fieldClass} resize-y`}
          rows={4}
          maxLength={20_000}
          value={draft.question}
          onChange={(event) =>
            onDraftChange((previous) => ({
              ...previous,
              question: event.target.value,
            }))
          }
          required
          disabled={disabled}
          placeholder="How does the API change affect its consumers?"
        />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <Label htmlFor={`${id}-engine`}>Analysis engine</Label>
        <WorkspaceSelect
          id={`${id}-engine`}
          value={draft.engine}
          disabled={disabled || !catalog}
          onChange={(event) =>
            onDraftChange((previous) => ({
              ...previous,
              engine: event.target.value as AnalysisEngine | "",
            }))
          }
        >
          <option value="">
            Server default
            {catalog ? ` · ${engineLabels[catalog.default_engine]}` : ""}
          </option>
          {catalog?.engines.map(({ id, ready }) => (
            <option
              key={id}
              value={id}
            >
              {engineLabels[id]}
              {ready ? "" : " · unavailable"}
            </option>
          ))}
        </WorkspaceSelect>
        {selectedEngine && !selectedEngine.ready && (
          <p className="text-sm text-muted-foreground">
            {selectedEngine.blockers.map(analysisBlockerMessage).join(" ") ||
              "Choose an available engine."}
          </p>
        )}
        {catalogError && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Engine availability couldn’t be checked. You can use the server
              default.
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-touch"
              onClick={onRetryCatalog}
            >
              Retry engine lookup
            </Button>
          </div>
        )}
      </div>
      <AnalysisOptions
        id={id}
        targets={targets}
        draft={draft}
        onChange={onDraftChange}
        disabled={disabled}
      />
    </form>
  );
}
