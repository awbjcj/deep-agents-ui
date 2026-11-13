import { ChevronDown, GitCompare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ResolvedTarget } from "@/lib/code-workspace";
import { fieldClass, WorkspaceSelect } from "./WorkspaceFields";
import type { AnalysisFormDraft, DraftSetter } from "./types";

export function AnalysisOptions({
  id,
  targets,
  draft,
  onChange,
  disabled,
}: {
  id: string;
  targets: ResolvedTarget[];
  draft: AnalysisFormDraft;
  onChange: DraftSetter<AnalysisFormDraft>;
  disabled: boolean;
}) {
  const options = targets.map(({ target, target_handle }) => (
    <option
      key={target_handle}
      value={target_handle}
    >
      {target.ref.repository} · {target.revision.slice(0, 12)} ·{" "}
      {target.ref.server_id}
    </option>
  ));
  return (
    <details
      className="group/options border-t border-border pt-1"
      open={draft.pairs.length > 0 || !!draft.checklist || undefined}
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <GitCompare
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />{" "}
        <span className="min-w-0 flex-1">Comparison and report options</span>{" "}
        <ChevronDown
          className="ml-auto size-4 text-muted-foreground group-open/options:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 pt-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Compare two prepared revisions, or list questions the report must
          address.
        </p>
        {draft.pairs.map((pair, index) => (
          <fieldset
            key={pair.id}
            className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-border p-3"
            disabled={disabled}
          >
            <legend className="px-1 text-xs font-medium">
              Comparison {index + 1}
            </legend>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor={`${id}-base-${pair.id}`}>Base revision</Label>
              <WorkspaceSelect
                id={`${id}-base-${pair.id}`}
                value={pair.base}
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    pairs: previous.pairs.map((row) =>
                      row.id === pair.id
                        ? { ...row, base: event.target.value }
                        : row
                    ),
                  }))
                }
              >
                <option value="">Choose a revision</option>
                {options}
              </WorkspaceSelect>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              <Label htmlFor={`${id}-target-${pair.id}`}>Target revision</Label>
              <WorkspaceSelect
                id={`${id}-target-${pair.id}`}
                value={pair.target}
                onChange={(event) =>
                  onChange((previous) => ({
                    ...previous,
                    pairs: previous.pairs.map((row) =>
                      row.id === pair.id
                        ? { ...row, target: event.target.value }
                        : row
                    ),
                  }))
                }
              >
                <option value="">Choose a revision</option>
                {options}
              </WorkspaceSelect>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto min-h-touch min-w-0 max-w-full justify-self-start whitespace-normal py-2 text-muted-foreground"
              onClick={() =>
                onChange((previous) => ({
                  ...previous,
                  pairs: previous.pairs.filter((row) => row.id !== pair.id),
                }))
              }
            >
              <X aria-hidden="true" /> Remove comparison {index + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-touch min-w-0 max-w-full whitespace-normal py-2"
          disabled={disabled || targets.length < 2 || draft.pairs.length >= 20}
          onClick={() =>
            onChange((previous) => ({
              ...previous,
              pairs: [
                ...previous.pairs,
                {
                  id: (previous.pairs.at(-1)?.id ?? 0) + 1,
                  base: "",
                  target: "",
                },
              ],
            }))
          }
        >
          <Plus aria-hidden="true" /> Add comparison
        </Button>
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <Label htmlFor={`${id}-checklist`}>Report checklist</Label>
          <Textarea
            id={`${id}-checklist`}
            className={fieldClass}
            maxLength={20_000}
            rows={4}
            value={draft.checklist}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                checklist: event.target.value,
              }))
            }
            disabled={disabled}
            aria-describedby={`${id}-checklist-hint`}
            placeholder="Which services depend on this API?"
          />
          <p
            id={`${id}-checklist-hint`}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            One question per line, up to 32. The report addresses each question
            separately.
          </p>
        </div>
      </div>
    </details>
  );
}
