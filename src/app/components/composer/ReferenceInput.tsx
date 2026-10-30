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
import { BookOpen } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import {
  activeFileQuery,
  searchFiles,
  type FileQuery,
  type FileReference,
  type FileReferenceEntry,
} from "@/lib/file-references";
import {
  activeSkillQuery,
  MAX_SKILL_REFERENCES,
  searchSkills,
  type SkillQuery,
  type SkillReference,
} from "@/lib/skill-references";
import type { SkillCatalogEntry } from "@/lib/skills";
import { cn } from "@/lib/utils";
import { SkillReferenceText } from "../skills/SkillReferenceText";
import { FileSuggestions, SkillSuggestions } from "./ReferenceSuggestions";
import { SuggestionPanel } from "./SuggestionPanel";

const textLayout =
  "w-full whitespace-pre-wrap break-words px-4 py-4 text-base leading-6";

export interface ReferenceInsertion {
  text: string;
  caret: number;
}

/**
 * Message textarea with inline `$skill` and `@file` pickers. Native editing
 * and focus stay in the textarea; Enter or Tab completes the active option.
 */
export function ReferenceInput({
  accountId,
  value,
  inputRef,
  isLoading,
  submitAction = "send",
  skillReferences,
  skillCatalog,
  skillCatalogLoading: loading,
  skillCatalogError: error,
  onRefreshSkills,
  fileReferences,
  fileCatalog,
  fileUnavailableReason,
  onChange,
  onSelectSkill,
  onSelectFile,
  onKeyDown,
}: {
  accountId?: string;
  value: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  submitAction?: "send" | "queue" | "steer";
  skillReferences: SkillReference[];
  skillCatalog: SkillCatalogEntry[];
  skillCatalogLoading: boolean;
  skillCatalogError: string | null;
  onRefreshSkills: () => void;
  fileReferences: FileReference[];
  fileCatalog: FileReferenceEntry[];
  fileUnavailableReason: string | null;
  onChange: (value: string) => void;
  onSelectSkill: (
    entry: SkillCatalogEntry,
    query: SkillQuery
  ) => ReferenceInsertion | null;
  onSelectFile: (
    entry: FileReferenceEntry,
    query: FileQuery
  ) => ReferenceInsertion | null;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const id = useId();
  const highlightRef = useRef<HTMLDivElement>(null);
  const highlightViewportRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [panelHeight, setPanelHeight] = useState(320);
  const signature = `${selection.start}:${value}`;
  const caret =
    focused && selection.start === selection.end && signature !== dismissed
      ? selection.start
      : null;

  const skillQuery =
    caret !== null && accountId
      ? activeSkillQuery(value, caret, skillReferences, fileReferences)
      : null;
  const rawFileQuery =
    caret !== null
      ? activeFileQuery(value, caret, fileReferences, skillReferences)
      : null;
  const fileMatches = rawFileQuery
    ? searchFiles(fileCatalog, rawFileQuery.query)
    : [];
  // A spaced query with no match is ordinary prose ("meet @ 5pm"), not a mention.
  const fileQuery =
    rawFileQuery && (fileMatches.length || !/\s/u.test(rawFileQuery.query))
      ? rawFileQuery
      : null;
  const mode: "skill" | "file" | null =
    skillQuery && (!fileQuery || skillQuery.start > fileQuery.start)
      ? "skill"
      : fileQuery
      ? "file"
      : null;
  const skillMatches =
    mode === "skill" && skillQuery
      ? searchSkills(skillCatalog, skillQuery.query)
      : [];
  const atLimit = skillReferences.length >= MAX_SKILL_REFERENCES;
  const matchCount =
    mode === "skill" ? skillMatches.length : fileMatches.length;
  const selectable =
    mode === "skill"
      ? !loading && !error && !atLimit && skillMatches.length > 0
      : mode === "file" && !fileUnavailableReason && fileMatches.length > 0;
  const activeIndex = Math.min(active, Math.max(0, matchCount - 1));
  const listId = `${id}-list`;
  const activeId = selectable ? `${listId}-option-${activeIndex}` : undefined;
  const queryKey =
    mode === "skill"
      ? `skill:${skillQuery?.query}`
      : mode === "file"
      ? `file:${fileQuery?.query}`
      : "";
  const referencedSkillCount = new Set(
    skillReferences.map((ref) => `${ref.origin}:${ref.id}`)
  ).size;

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
    if (mode === "skill") onRefreshSkills();
  }, [mode, onRefreshSkills]);

  useEffect(() => setActive(0), [queryKey]);
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
  const apply = (next: ReferenceInsertion | null) => {
    if (!next) return;
    setDismissed(`${next.caret}:${next.text}`);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
      setSelection({ start: next.caret, end: next.caret });
    });
  };
  const chooseSkill = (entry: SkillCatalogEntry) => {
    if (!skillQuery || atLimit || getAuthUser()?.user_id !== accountId) return;
    apply(onSelectSkill(entry, skillQuery));
  };
  const chooseFile = (entry: FileReferenceEntry) => {
    if (!fileQuery || fileUnavailableReason) return;
    apply(onSelectFile(entry, fileQuery));
  };
  const chooseActive = () => {
    if (!selectable) return;
    if (mode === "skill") chooseSkill(skillMatches[activeIndex]);
    else chooseFile(fileMatches[activeIndex]);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (mode) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(signature);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (matchCount)
          setActive(
            (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matchCount) %
              matchCount
          );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        // Enter chooses a result; even empty/loading results must never send.
        event.preventDefault();
        chooseActive();
        return;
      }
      if (event.key === "Tab") {
        const plain =
          !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
        // Tab completes like Enter, but still moves focus when nothing can be
        // chosen so the picker never traps keyboard users.
        if (plain && selectable) {
          event.preventDefault();
          chooseActive();
          return;
        }
        setDismissed(signature);
      }
    }
    onKeyDown(event);
  };

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      {mode === "skill" && (
        <SuggestionPanel
          listId={listId}
          label="Skill suggestions"
          title="Skills"
          description="Search names and introductions"
          status={
            loading
              ? "Loading skills"
              : error
              ? "Skills could not be loaded"
              : `${skillMatches.length} skills found`
          }
          busy={loading}
          maxHeight={panelHeight}
        >
          <SkillSuggestions
            listId={listId}
            matches={skillMatches}
            activeIndex={activeIndex}
            loading={loading}
            error={error}
            atLimit={atLimit}
            onRetry={onRefreshSkills}
            onActivate={setActive}
            onChoose={chooseSkill}
          />
        </SuggestionPanel>
      )}
      {mode === "file" && (
        <SuggestionPanel
          listId={listId}
          label="File suggestions"
          title="Files"
          description="Reference files in this conversation"
          status={fileUnavailableReason ?? `${fileMatches.length} files found`}
          maxHeight={panelHeight}
        >
          <FileSuggestions
            listId={listId}
            matches={fileMatches}
            activeIndex={activeIndex}
            empty={fileCatalog.length === 0}
            unavailableReason={fileUnavailableReason}
            onActivate={setActive}
            onChoose={chooseFile}
          />
        </SuggestionPanel>
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
            references={skillReferences}
            fileReferences={fileReferences}
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
        aria-controls={mode ? listId : undefined}
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
        are referenced automatically. Type $ to find a skill or @ to reference a
        file in this conversation. Use arrow keys to navigate, Enter or Tab to
        select, and Escape to dismiss.
      </span>
      {!mode && loading && (
        <span
          role="status"
          className="sr-only"
        >
          Checking skills…
        </span>
      )}
      {!mode && (error || skillReferences.length > 0) && (
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
                onClick={onRefreshSkills}
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
