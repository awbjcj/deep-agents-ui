"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { BookOpen, CornerDownLeft, Loader2, Search } from "lucide-react";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/lib/auth";
import type { SkillCatalogEntry } from "@/lib/skills";
import {
  activeSkillQuery,
  insertSkillReference,
  MAX_SKILL_REFERENCES,
  searchSkills,
  type SkillReference,
} from "@/lib/skill-references";
import { cn } from "@/lib/utils";
import { SkillReferenceText } from "./SkillReferenceText";

const textLayout =
  "w-full whitespace-pre-wrap break-words px-4 py-4 text-base leading-6";

/** Keep native editing and focus while offering an accessible suggestion list. */
export function SkillReferenceInput({
  accountId,
  value,
  references,
  catalog,
  catalogLoading: loading,
  catalogError: error,
  onRefreshCatalog,
  inputRef,
  isLoading,
  submitAction = "send",
  onChange,
  onSelect,
  onKeyDown,
}: {
  accountId?: string;
  value: string;
  references: SkillReference[];
  catalog: SkillCatalogEntry[];
  catalogLoading: boolean;
  catalogError: string | null;
  onRefreshCatalog: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  submitAction?: "send" | "queue" | "steer";
  onChange: (value: string) => void;
  onSelect: (text: string, references: SkillReference[]) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const highlightViewportRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [panelHeight, setPanelHeight] = useState(320);
  const signature = `${selection.start}:${value}`;
  const query =
    focused && selection.start === selection.end && signature !== dismissed
      ? activeSkillQuery(value, selection.start, references)
      : null;
  const open = query !== null && !!accountId;
  const matches = searchSkills(catalog, query?.query ?? "");
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const atLimit = references.length >= MAX_SKILL_REFERENCES;
  const referencedSkillCount = new Set(
    references.map((ref) => `${ref.origin}:${ref.id}`)
  ).size;
  const activeId =
    open && !loading && !error && !atLimit && matches.length
      ? `${id}-option-${activeIndex}`
      : undefined;

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const resize = () => {
      const scroll = textarea.scrollTop;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.scrollTop = scroll;
      if (highlightRef.current) {
        highlightRef.current.style.width = `${textarea.clientWidth}px`;
        highlightRef.current.style.transform = `translateY(-${textarea.scrollTop}px)`;
      }
      if (highlightViewportRef.current)
        highlightViewportRef.current.style.height = `${textarea.clientHeight}px`;
      setPanelHeight(
        Math.max(96, Math.min(320, textarea.getBoundingClientRect().top - 20))
      );
    };
    resize();
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== textarea.clientWidth) {
        width = textarea.clientWidth;
        resize();
      }
    });
    observer.observe(textarea);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [value, inputRef]);

  useEffect(() => {
    if (open) onRefreshCatalog();
  }, [open, onRefreshCatalog]);

  useEffect(() => setActive(0), [query?.query]);
  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const updateSelection = () => {
    const textarea = inputRef.current;
    if (textarea)
      setSelection({
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      });
  };
  const choose = (entry: SkillCatalogEntry) => {
    if (!query || atLimit || getAuthUser()?.user_id !== accountId) return;
    const next = insertSkillReference(value, query, entry, references);
    onSelect(next.text, next.references);
    setDismissed(`${next.caret}:${next.text}`);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
      setSelection({ start: next.caret, end: next.caret });
    });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (open) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(signature);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (matches.length)
          setActive(
            (activeIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              matches.length) %
              matches.length
          );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        // Enter chooses a result; even empty/loading results must never send.
        event.preventDefault();
        if (!loading && !error && matches[activeIndex])
          choose(matches[activeIndex]);
        return;
      }
      if (event.key === "Tab") setDismissed(signature);
    }
    onKeyDown(event);
  };

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      {open && (
        <section
          aria-label="Skill suggestions"
          className="absolute bottom-full left-2 right-2 z-[80] mb-2 flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          style={{ maxHeight: panelHeight }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <Search
              aria-hidden="true"
              className="size-3.5"
            />
            <span className="font-medium text-foreground">Skills</span>
            <span className="min-w-0 flex-1 truncate">
              Search names and introductions
            </span>
            <kbd className="rounded border border-border px-1">Esc</kbd>
          </div>
          <div
            role="status"
            className="sr-only"
          >
            {loading
              ? "Loading skills"
              : error
              ? "Skills could not be loaded"
              : `${matches.length} skills found`}
          </div>
          <div
            id={id}
            role="listbox"
            aria-label="Skills"
            aria-busy={loading}
            className="min-h-0 overflow-y-auto overscroll-contain p-1"
          >
            {loading ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin"
                />{" "}
                Loading skills…
              </p>
            ) : error ? (
              <div className="p-3 text-sm">
                <p>{error}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={onRefreshCatalog}
                >
                  Retry skills
                </Button>
              </div>
            ) : atLimit ? (
              <p className="p-3 text-sm text-muted-foreground">
                You can reference up to {MAX_SKILL_REFERENCES} skills in a
                message.
              </p>
            ) : matches.length ? (
              matches.map((entry, index) => (
                <Suggestion
                  key={`${entry.origin}:${entry.id}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  suggestion={entry.name}
                  variant="ghost"
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerMove={(event) => {
                    if (event.pointerType === "mouse") setActive(index);
                  }}
                  onClick={() => choose(entry)}
                  className={cn(
                    "h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-lg px-3 py-2 text-left font-normal transition-none hover:bg-transparent hover:text-inherit active:bg-accent dark:hover:bg-transparent",
                    index === activeIndex &&
                      "bg-accent text-accent-foreground ring-1 ring-inset ring-border hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent"
                  )}
                >
                  <BookOpen
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 self-start"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 max-w-full font-medium [overflow-wrap:anywhere]">
                        ${entry.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.origin === "personal" ? "Personal" : "System"}
                      </span>
                    </span>
                    <span
                      title={entry.description}
                      className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
                    >
                      {entry.description}
                    </span>
                  </span>
                  <CornerDownLeft
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 shrink-0",
                      index !== activeIndex && "invisible"
                    )}
                  />
                </Suggestion>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                No matching skills. Try another name or description.
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            ↑ ↓ Navigate <span className="mx-2">·</span> Enter Select
          </div>
        </section>
      )}
      <div
        ref={highlightViewportRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      >
        <div
          ref={highlightRef}
          className={cn(textLayout, "text-transparent")}
        >
          <SkillReferenceText
            text={value}
            references={references}
            decorationOnly
          />
          {"\n"}
        </div>
      </div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => {
          setDismissed(null);
          onChange(event.target.value);
          updateSelection();
        }}
        onSelect={updateSelection}
        onFocus={() => {
          setFocused(true);
          updateSelection();
        }}
        onKeyDown={handleKeyDown}
        onScroll={(event) => {
          if (highlightRef.current)
            highlightRef.current.style.transform = `translateY(-${event.currentTarget.scrollTop}px)`;
        }}
        aria-label="Message"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={activeId}
        aria-describedby={`${id}-hint`}
        placeholder={isLoading ? "Add a follow-up…" : "Enter your message…"}
        className={cn(
          textLayout,
          "relative block max-h-[32dvh] min-h-20 shrink-0 resize-none overflow-y-auto overscroll-contain border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground focus:border-transparent focus:ring-0"
        )}
        rows={1}
      />
      <span
        id={`${id}-hint`}
        className="sr-only"
      >
        Enter to {submitAction}. Shift+Enter for a new line. Exact skill names
        are referenced automatically. Type $ to find a skill. Use arrow keys to
        navigate, Enter to select, and Escape to dismiss.
      </span>
      {!open && loading && (
        <span
          role="status"
          className="sr-only"
        >
          Checking skills…
        </span>
      )}
      {!open && (error || references.length > 0) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 px-4 pb-2 text-xs text-muted-foreground"
        >
          {error ? (
            <>
              <span>Skill matching unavailable.</span>
              <button
                type="button"
                className="rounded underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onRefreshCatalog}
              >
                Retry skills
              </button>
            </>
          ) : (
            <>
              <BookOpen
                aria-hidden="true"
                className="size-3.5"
              />
              {referencedSkillCount}{" "}
              {referencedSkillCount === 1
                ? "skill referenced"
                : "skills referenced"}
            </>
          )}
        </div>
      )}
    </div>
  );
}
