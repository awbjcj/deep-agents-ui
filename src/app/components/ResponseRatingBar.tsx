"use client";

import { memo, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Star } from "lucide-react";
import {
  useRatingTarget,
  type ThreadRatings,
} from "@/app/hooks/useThreadRatings";
import { Button } from "@/components/ui/button";
import { rankRatingTags, type RatingTargetType } from "@/lib/rl-feedback";
import { cn } from "@/lib/utils";

const SCORES = [1, 2, 3, 4, 5] as const;
const STAR_DIRECTIONS: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

interface ResponseRatingBarProps {
  ratings: ThreadRatings;
  targetType: RatingTargetType;
  targetId: string;
  domain?: string;
  tools?: readonly string[];
  className?: string;
}

/** Rate a visible reply or delegated run and optionally attach catalog tags. */
export const ResponseRatingBar = memo(function ResponseRatingBar({
  ratings,
  targetType,
  targetId,
  domain,
  tools,
  className,
}: ResponseRatingBarProps) {
  const { readout, update } = useRatingTarget(ratings, targetType, targetId);
  const [preview, setPreview] = useState<number | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const starButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const tagsId = useId();

  const rating = readout?.rating;
  const catalog = readout?.catalog;
  const hasTags = Boolean(catalog?.length);
  const tags = useMemo(
    () =>
      tagsOpen && catalog?.length && rating
        ? rankRatingTags(catalog, rating, domain, tools)
        : null,
    [tagsOpen, catalog, rating, domain, tools]
  );

  if (!readout) return null;
  const label =
    targetType === "agent_message" ? "Rate response" : "Rate subagent run";
  const score = rating?.score ?? 0;
  const tagCount = rating?.tags.length ?? 0;

  function selectScore(value: number, toggle: boolean) {
    if (!rating) {
      setTagsOpen(true);
      setMoreOpen(false);
    }
    update((previous) => {
      if (previous?.score === value) return toggle ? null : previous;
      return { score: value, tags: previous?.tags ?? [] };
    });
  }

  return (
    <div
      className={cn(
        "text-muted-foreground min-w-0 space-y-1.5 text-xs",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{label}</span>
        <div
          role="radiogroup"
          aria-label={label}
          className="flex items-center"
          onPointerLeave={() => setPreview(null)}
        >
          {SCORES.map((value, index) => (
            <Button
              key={value}
              ref={(button) => {
                starButtons.current[index] = button;
              }}
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "focus-visible:ring-ring size-8 focus-visible:ring-2 [@media(pointer:coarse)]:size-11",
                value <= (preview ?? score) && "text-warning hover:text-warning"
              )}
              role="radio"
              aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
              aria-checked={value === score}
              tabIndex={value === (score || 1) ? 0 : -1}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") setPreview(value);
              }}
              onKeyDown={(event) => {
                const direction = STAR_DIRECTIONS[event.key];
                if (!direction) return;
                event.preventDefault();
                setPreview(null);
                const next =
                  (index + direction + SCORES.length) % SCORES.length;
                starButtons.current[next]?.focus();
                selectScore(SCORES[next], false);
              }}
              onClick={(event) => {
                setPreview(null);
                selectScore(value, event.detail > 0);
              }}
            >
              <Star
                className={cn(
                  "size-4",
                  value <= (preview ?? score) && "fill-current"
                )}
                aria-hidden="true"
              />
            </Button>
          ))}
        </div>
        {rating && (
          <>
            {hasTags && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-2 text-xs [@media(pointer:coarse)]:min-h-11"
                aria-expanded={tagsOpen}
                aria-controls={tagsId}
                onClick={() => setTagsOpen((open) => !open)}
              >
                Reason tags{tagCount > 0 ? ` (${tagCount})` : ""}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-3", tagsOpen && "rotate-180")}
                />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2 text-xs [@media(pointer:coarse)]:min-h-11"
              onClick={() => {
                starButtons.current[0]?.focus();
                update(() => null);
              }}
            >
              Clear rating
            </Button>
          </>
        )}
      </div>
      {rating && hasTags && (
        <div
          id={tagsId}
          hidden={!tagsOpen}
          className="border-border/70 space-y-2 border-s py-1 ps-3"
        >
          {tags && (
            <>
              <p
                role="status"
                className="tabular-nums"
              >
                {tagCount} of 5 selected
              </p>
              <div
                role="group"
                aria-label="Reason tags"
                className="flex flex-wrap items-center gap-1.5"
              >
                {(moreOpen ? tags.all : tags.suggested).map((tag) => {
                  const selected = rating.tags.includes(tag.id);
                  return (
                    <Button
                      key={tag.id}
                      type="button"
                      variant={selected ? "secondary" : "outline"}
                      size="sm"
                      className={cn(
                        "h-auto min-h-7 max-w-full rounded-full px-2.5 py-1 text-start text-xs [overflow-wrap:anywhere] whitespace-normal [@media(pointer:coarse)]:min-h-11",
                        selected &&
                          "border-primary/40 bg-primary/10 text-primary"
                      )}
                      title={tag.description}
                      aria-pressed={selected}
                      disabled={!selected && rating.tags.length >= 5}
                      onClick={() => {
                        update((previous) => {
                          if (!previous) return previous;
                          if (previous.tags.includes(tag.id)) {
                            return {
                              ...previous,
                              tags: previous.tags.filter((id) => id !== tag.id),
                            };
                          }
                          if (previous.tags.length >= 5) return previous;
                          return {
                            ...previous,
                            tags: [...previous.tags, tag.id],
                          };
                        });
                      }}
                    >
                      <span className="relative ps-4">
                        {selected && (
                          <Check
                            aria-hidden="true"
                            className="absolute start-0 top-0.5 size-3"
                          />
                        )}
                        {tag.label}
                      </span>
                    </Button>
                  );
                })}
                {tags.more.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs [@media(pointer:coarse)]:min-h-11"
                    onClick={() => setMoreOpen(!moreOpen)}
                    aria-expanded={moreOpen}
                  >
                    {moreOpen ? "Fewer tags" : "More tags"}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("size-3", moreOpen && "rotate-180")}
                    />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
