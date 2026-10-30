import { Fragment } from "react";
import type { FileReference } from "@/lib/file-references";
import type { SkillReference } from "@/lib/skill-references";
import { cn } from "@/lib/utils";

/** Highlight `$skill` references and, in the composer, `@file` mentions. */
export function SkillReferenceText({
  text,
  references,
  fileReferences = [],
  decorationOnly = false,
}: {
  text: string;
  references: SkillReference[];
  fileReferences?: FileReference[];
  decorationOnly?: boolean;
}) {
  const spans = [
    ...references.map((reference) => ({ type: "skill" as const, reference })),
    ...fileReferences.map((reference) => ({
      type: "file" as const,
      reference,
    })),
  ].sort((a, b) => a.reference.start - b.reference.start);
  let end = 0;
  return (
    <>
      {spans.map((span) => {
        const { reference } = span;
        if (reference.start < end) return null;
        const before = text.slice(end, reference.start);
        end = reference.end;
        return (
          <Fragment key={`${span.type}:${reference.start}`}>
            {before}
            <mark
              {...(span.type === "skill"
                ? {
                    "data-skill-reference": span.reference.name,
                    title: `${
                      span.reference.origin === "personal"
                        ? "Personal"
                        : "System"
                    } skill: ${span.reference.name}`,
                  }
                : {
                    "data-file-reference": span.reference.path,
                    title: `File: ${span.reference.path}`,
                  })}
              className={cn(
                "rounded-sm bg-primary/15 underline decoration-primary/40 underline-offset-4",
                decorationOnly ? "text-transparent" : "text-foreground"
              )}
            >
              {text.slice(reference.start, reference.end)}
            </mark>
          </Fragment>
        );
      })}
      {text.slice(end)}
    </>
  );
}
