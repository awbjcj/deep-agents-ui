"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle, Clock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import {
  apiGetRunMode,
  apiSetRunMode,
  type RunMode,
  type RunModeInfo,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LoadingRow, SectionHeader } from "@/app/components/admin/primitives";

const RUN_MODES: RunMode[] = ["remote", "gateway", "proxy"];

/** Selects provider routing; advanced endpoints live beside it in Runtime. */
export function RunModeSection() {
  const [pending, setPending] = useState<RunMode>("gateway");
  const [info, setInfo] = useState<RunModeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiGetRunMode()
      .then((data) => {
        setPending(data.run_mode);
        setInfo(data);
      })
      .catch(() => toast.error("Failed to load run mode"))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(
    () => () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const dirty = info !== null && pending !== info.run_mode;

  const save = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const updated = await apiSetRunMode(pending);
      setPending(updated.run_mode);
      setInfo(updated);
      setSaved(true);
      toast.success("Run mode saved");
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save run mode"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onRadioKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const last = RUN_MODES.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? last : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = RUN_MODES[nextIndex]!;
    setPending(target);
    radioRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Run mode"
        subtitle="How agent requests reach the LLM backend"
      />
      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="aptiv-glass-soft space-y-3 rounded-lg p-3 shadow-sm">
          <div
            role="radiogroup"
            aria-label="Modes"
            className="grid grid-cols-3 gap-2"
          >
            {RUN_MODES.map((mode, index) => {
              const active = pending === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  ref={(element) => {
                    radioRefs.current[index] = element;
                  }}
                  onKeyDown={(event) => onRadioKeyDown(event, index)}
                  onClick={() => setPending(mode)}
                  className={cn(
                    "relative flex min-w-0 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-[background-color,border-color,box-shadow,color] duration-150 motion-reduce:transition-none",
                    "focus-visible:ring-[var(--color-primary)]/40 focus-visible:outline-none focus-visible:ring-2",
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--text-button-primary)] shadow-sm"
                      : "hover:border-[var(--color-primary)]/40 border-border bg-card"
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--aptiv-orange)]"
                    />
                  ) : null}
                  <span className="text-xs font-semibold tracking-tight">
                    {mode}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-semibold uppercase tracking-[0.1em]",
                      active
                        ? "text-[var(--text-button-primary)]/80"
                        : "text-muted-foreground"
                    )}
                  >
                    {runModeBlurb(mode)}
                  </span>
                </button>
              );
            })}
          </div>
          {info && info.run_mode_updated_at !== "Unknown" ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
              <Clock
                className="h-3 w-3"
                aria-hidden="true"
              />
              <span className="font-semibold uppercase tracking-wider">
                Updated
              </span>
              <time
                className="font-mono tabular-nums"
                dateTime={info.run_mode_updated_at}
              >
                {formatTimestamp(info.run_mode_updated_at)}
              </time>
              <span>({info.run_mode_time_gap})</span>
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={isSaving || !dirty}
            className="w-full"
          >
            {isSaving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : saved ? (
              <CheckCircle
                className="mr-2 h-4 w-4"
                aria-hidden="true"
              />
            ) : (
              <Save
                className="mr-2 h-4 w-4"
                aria-hidden="true"
              />
            )}
            {isSaving ? "Saving" : saved ? "Saved" : "Save run mode"}
          </Button>
        </div>
      )}
    </div>
  );
}

function runModeBlurb(mode: RunMode): string {
  switch (mode) {
    case "remote":
      return "Direct provider";
    case "gateway":
      return "Via gateway";
    case "proxy":
      return "Via proxy";
  }
}
