import { Fragment } from "react";
import type { SkillReference } from "@/lib/skill-references";
import { cn } from "@/lib/utils";

export function SkillReferenceText({
  text,
  references,
  decorationOnly = false,
}: {
  text: string;
  references: SkillReference[];
  decorationOnly?: boolean;
}) {
  let end = 0;
  return (
    <>
      {references.map((reference) => {
        const before = text.slice(end, reference.start);
        end = reference.end;
        return (
          <Fragment key={`${reference.start}:${reference.id}`}>
            {before}
            <mark
              data-skill-reference={reference.name}
              title={`${
                reference.origin === "personal" ? "Personal" : "System"
              } skill: ${reference.name}`}
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
