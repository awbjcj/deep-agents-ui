"use client";

import { BookOpen, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileReferenceEntry } from "@/lib/file-references";
import { MAX_SKILL_REFERENCES } from "@/lib/skill-references";
import type { SkillCatalogEntry } from "@/lib/skills";
import { SOURCE_IMAGE_LABELS } from "@/lib/source-images";
import { SuggestionMessage, SuggestionOption } from "./SuggestionPanel";

interface ListProps<T> {
  listId: string;
  matches: T[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onChoose: (entry: T) => void;
}

/** Options for the `$` skill picker, including catalog loading states. */
export function SkillSuggestions({
  listId,
  matches,
  activeIndex,
  loading,
  error,
  atLimit,
  onRetry,
  onActivate,
  onChoose,
}: ListProps<SkillCatalogEntry> & {
  loading: boolean;
  error: string | null;
  atLimit: boolean;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2
          aria-hidden="true"
          className="size-4 motion-safe:animate-spin"
        />{" "}
        Loading skills…
      </p>
    );
  if (error)
    return (
      <div className="p-3 text-sm">
        <p>{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={onRetry}
        >
          Retry skills
        </Button>
      </div>
    );
  if (atLimit)
    return (
      <SuggestionMessage>
        You can reference up to {MAX_SKILL_REFERENCES} skills in a message.
      </SuggestionMessage>
    );
  if (!matches.length)
    return (
      <SuggestionMessage>
        No matching skills. Try another name or description.
      </SuggestionMessage>
    );
  return matches.map((entry, index) => (
    <SuggestionOption
      key={`${entry.origin}:${entry.id}`}
      id={`${listId}-option-${index}`}
      value={entry.name}
      active={index === activeIndex}
      icon={
        <BookOpen
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 self-start"
        />
      }
      name={`$${entry.name}`}
      meta={entry.origin === "personal" ? "Personal" : "System"}
      description={entry.description}
      onActivate={() => onActivate(index)}
      onChoose={() => onChoose(entry)}
    />
  ));
}

/** Options for the `@` file picker over the conversation's workspace files. */
export function FileSuggestions({
  listId,
  matches,
  activeIndex,
  empty,
  unavailableReason,
  onActivate,
  onChoose,
}: ListProps<FileReferenceEntry> & {
  empty: boolean;
  unavailableReason: string | null;
}) {
  if (unavailableReason)
    return <SuggestionMessage>{unavailableReason}</SuggestionMessage>;
  if (empty)
    return (
      <SuggestionMessage>
        No files in this conversation yet. Upload a file first.
      </SuggestionMessage>
    );
  if (!matches.length)
    return (
      <SuggestionMessage>
        No matching files. Try another name or folder.
      </SuggestionMessage>
    );
  return matches.map((entry, index) => {
    const Icon = entry.kind === "image" ? ImageIcon : FileText;
    return (
      <SuggestionOption
        key={entry.path}
        id={`${listId}-option-${index}`}
        value={entry.label}
        active={index === activeIndex}
        icon={
          <Icon
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 self-start"
          />
        }
        name={`@${entry.label}`}
        meta={
          entry.source
            ? `${SOURCE_IMAGE_LABELS[entry.source.source]} source image`
            : entry.kind === "image"
            ? "Image"
            : "Document"
        }
        description={entry.path}
        onActivate={() => onActivate(index)}
        onChoose={() => onChoose(entry)}
      />
    );
  });
}
