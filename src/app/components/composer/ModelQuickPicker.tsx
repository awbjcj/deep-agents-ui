"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Cpu,
  Loader2,
  RotateCw,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatTokenCap, requiresThinking } from "@/lib/model-controls";
import { effortDisplayName, modelDisplayName } from "@/lib/model-names";
import { useModelSelection } from "@/app/hooks/useModelSelection";
import {
  ReasoningEffortControl,
  TaskBudgetControl,
} from "@/app/components/ModelInferenceControls";
import { COMPOSER_TRIGGER, TRIGGER_TONE } from "../ComposerMenuOption";
import { ModelList, OutputStepper, ThinkingRow } from "./ModelPickerSections";

const DEFAULT_EFFORTS = ["low", "medium", "high"];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-border bg-background text-foreground rounded border px-1 font-mono text-xs leading-4">
      {children}
    </kbd>
  );
}

/**
 * Composer quick picker for the user's model, reasoning effort, adaptive
 * thinking, and max output tokens, styled after the Copilot CLI `/model`
 * picker. Changes save to the user's model settings (the same values as
 * Workspace › Models) and apply to the next message.
 */
export function ModelQuickPicker({ accountId }: { accountId?: string }) {
  const selection = useModelSelection(accountId);
  const { status, models, draft, saving, saveFailed } = selection;
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const entry = draft
    ? (models.find(
        (m) => m.provider === draft.provider && m.model === draft.model
      ) ?? null)
    : null;
  const effortSupported = !!entry?.supports_effort;
  const thinkingRequired = requiresThinking(entry, draft?.effort ?? null);
  const effortLabel =
    effortSupported && draft?.effort ? effortDisplayName(draft.effort) : null;
  const capLabel = draft ? formatTokenCap(draft.max_tokens) : null;
  const modelName = draft?.model ? modelDisplayName(draft.model) : null;

  const summary = draft?.model
    ? [
        modelName,
        effortLabel && `${effortLabel} effort`,
        draft.max_tokens === 0
          ? "unlimited output (provider limits apply)"
          : `${draft.max_tokens.toLocaleString("en-US")} max output tokens`,
      ]
        .filter(Boolean)
        .join(", ")
    : status === "error"
      ? "unavailable"
      : "loading";

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEdited(false);
      selection.refresh();
    } else selection.flush();
  }

  function edit<T>(apply: (value: T) => void) {
    return (value: T) => {
      setEdited(true);
      apply(value);
    };
  }

  const TriggerIcon =
    status === "loading" && !draft
      ? Loader2
      : status === "error" && !draft
        ? AlertCircle
        : Cpu;

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Model: ${summary}`}
          title={
            draft?.model
              ? `${summary} (${draft.provider}/${draft.model})`
              : undefined
          }
          className={cn(
            COMPOSER_TRIGGER,
            TRIGGER_TONE.neutral,
            "focus-visible:ring-primary/25 inline-flex shrink-0 items-center outline-none focus-visible:ring-[3px]"
          )}
        >
          <TriggerIcon
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              TriggerIcon === Loader2 && "motion-safe:animate-spin"
            )}
          />
          {draft?.model && (
            <span className="hidden min-w-0 items-center gap-1 @[26rem]/composer:inline-flex">
              <span className="max-w-40 truncate font-medium">{modelName}</span>
              <span className="text-muted-foreground hidden whitespace-nowrap @[40rem]/composer:inline">
                {[effortLabel, capLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className="h-3! w-3! shrink-0 opacity-50"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Model selection"
        side="top"
        align="start"
        collisionPadding={8}
        className="w-88 max-w-[calc(100vw-1rem)] animate-none! rounded-xl p-0"
        onOpenAutoFocus={(event) => {
          if (!listRef.current) return;
          event.preventDefault();
          listRef.current.focus({ preventScroll: true });
        }}
      >
        <div className="px-3 pt-3 pb-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <div className="text-sm leading-5 font-medium">Select model</div>
            <span
              role="status"
              className="text-muted-foreground ml-auto flex min-h-5 min-w-20 items-center justify-end gap-1 text-xs whitespace-nowrap"
            >
              {saving ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="h-3 w-3 motion-safe:animate-spin"
                  />
                  Saving…
                </>
              ) : edited && saveFailed ? (
                <>
                  <AlertCircle
                    aria-hidden="true"
                    className="text-destructive h-3 w-3"
                  />
                  Not saved
                </>
              ) : edited ? (
                <>
                  <Check
                    aria-hidden="true"
                    className="h-3 w-3 text-(--color-success)"
                  />
                  Saved
                </>
              ) : null}
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            Applies to your next message
          </div>
        </div>

        {!draft ? (
          status === "error" ? (
            <div className="flex items-center justify-between gap-3 px-3 pt-1 pb-3 text-xs">
              <span className="text-muted-foreground">
                Couldn&apos;t load your model settings.
              </span>
              <button
                type="button"
                onClick={selection.refresh}
                className="hover:bg-primary/10 inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-(--color-primary)"
              >
                <RotateCw
                  aria-hidden="true"
                  className="h-3 w-3"
                />
                Retry
              </button>
            </div>
          ) : (
            <div
              className="space-y-1.5 px-3 pt-1 pb-3"
              aria-busy="true"
              aria-label="Loading models"
            >
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="bg-muted h-7 animate-pulse rounded-md motion-reduce:animate-none"
                />
              ))}
            </div>
          )
        ) : models.length === 0 ? (
          <div className="text-muted-foreground px-3 pt-1 pb-3 text-xs">
            No models are available for your account.
          </div>
        ) : (
          <>
            <div className="px-1.5 pb-2">
              <ModelList
                models={models}
                provider={draft.provider}
                model={draft.model}
                listRef={listRef}
                onSelect={edit(selection.chooseModel)}
              />
            </div>
            <div className="border-border space-y-3 border-t px-3 py-3">
              <ReasoningEffortControl
                options={
                  entry?.efforts.length ? entry.efforts : DEFAULT_EFFORTS
                }
                value={draft.effort}
                recommended={entry?.recommended_effort}
                supported={effortSupported}
                onChange={edit((effort: string) =>
                  selection.update({ effort })
                )}
              />
              {entry?.supports_thinking && (
                <ThinkingRow
                  checked={thinkingRequired || !!draft.thinking}
                  required={thinkingRequired}
                  onChange={edit((thinking: boolean) =>
                    selection.update({ thinking })
                  )}
                />
              )}
              <OutputStepper
                value={draft.max_tokens}
                allowUnlimited={!!entry?.supports_unlimited_output}
                recommended={entry?.recommended_max_tokens ?? 65536}
                onChange={edit((max_tokens: number) =>
                  selection.update({ max_tokens })
                )}
              />
              {entry?.supports_task_budget && (
                <TaskBudgetControl
                  value={draft.task_budget ?? null}
                  onChange={edit((task_budget: number | null) =>
                    selection.update({ task_budget })
                  )}
                />
              )}
              {!entry?.supports_task_budget && draft.task_budget != null && (
                <div className="text-muted-foreground text-xs">
                  Saved task budget is inactive on this connection.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={edit(() =>
                      selection.update({ task_budget: null })
                    )}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="border-border bg-muted/40 text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 rounded-b-xl border-t px-3 py-2 text-xs [@media(pointer:coarse)]:hidden">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑↓</Kbd> model
          </span>
          {effortSupported && (
            <span className="inline-flex items-center gap-1">
              <Kbd>←→</Kbd> effort
            </span>
          )}
          <span className="ml-auto">Presets in Workspace › Models</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
