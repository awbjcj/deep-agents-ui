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
import { modelDisplayName } from "@/lib/model-names";
import { useModelSelection } from "@/app/hooks/useModelSelection";
import { COMPOSER_TRIGGER, TRIGGER_TONE } from "../ComposerMenuOption";
import {
  EffortSegments,
  ModelList,
  OutputStepper,
  ThinkingRow,
} from "./ModelPickerSections";

const DEFAULT_EFFORTS = ["low", "medium", "high"];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] leading-4 text-foreground">
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
    ? models.find(
        (m) => m.provider === draft.provider && m.model === draft.model
      ) ?? null
    : null;
  const effortSupported = !!entry?.supports_effort;
  const thinkingRequired = requiresThinking(entry, draft?.effort ?? null);
  const effortLabel = effortSupported && draft?.effort ? draft.effort : null;
  const capLabel = draft ? formatTokenCap(draft.max_tokens) : null;
  const modelName = draft?.model ? modelDisplayName(draft.model) : null;

  const summary = draft?.model
    ? [
        modelName,
        effortLabel && `${effortLabel} effort`,
        `${draft.max_tokens.toLocaleString("en-US")} max output tokens`,
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
            "inline-flex shrink-0 items-center outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25"
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
              <span className="max-w-[10rem] truncate font-medium">
                {modelName}
              </span>
              <span className="hidden whitespace-nowrap text-muted-foreground @[40rem]/composer:inline">
                {[effortLabel, capLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className="!h-3 !w-3 shrink-0 opacity-50"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={8}
        className="w-[22rem] max-w-[calc(100vw-1rem)] rounded-xl p-0"
        onOpenAutoFocus={(event) => {
          if (!listRef.current) return;
          event.preventDefault();
          listRef.current.focus({ preventScroll: true });
        }}
      >
        <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-3">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-5">Select model</div>
            <div className="text-xs leading-4 text-muted-foreground">
              Applies to your next message
            </div>
          </div>
          <span
            role="status"
            className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
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
                  className="h-3 w-3 text-destructive"
                />
                Not saved
              </>
            ) : edited ? (
              <>
                <Check
                  aria-hidden="true"
                  className="h-3 w-3 text-[var(--color-success)]"
                />
                Saved
              </>
            ) : null}
          </span>
        </div>

        {!draft ? (
          status === "error" ? (
            <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1 text-xs">
              <span className="text-muted-foreground">
                Couldn&apos;t load your model settings.
              </span>
              <button
                type="button"
                onClick={selection.refresh}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium text-[var(--color-primary)] hover:bg-primary/10"
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
              className="space-y-1.5 px-3 pb-3 pt-1"
              aria-busy="true"
              aria-label="Loading models"
            >
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-7 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
                />
              ))}
            </div>
          )
        ) : models.length === 0 ? (
          <div className="px-3 pb-3 pt-1 text-xs text-muted-foreground">
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
            <div className="space-y-3 border-t border-border px-3 py-3">
              <EffortSegments
                options={
                  entry?.efforts.length ? entry.efforts : DEFAULT_EFFORTS
                }
                value={draft.effort}
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
                onChange={edit((max_tokens: number) =>
                  selection.update({ max_tokens })
                )}
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-b-xl border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑↓</Kbd> model
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>←→</Kbd> effort
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Tab</Kbd> next
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
          <span className="ml-auto">Presets in Workspace › Models</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
