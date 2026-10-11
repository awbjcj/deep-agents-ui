import { ChevronDown, Globe2, Minimize2, Search } from "lucide-react";

/** Explain provider activity without displaying private context or queries. */
export function ResponseActivity({ activity }: { activity: string[] }) {
  if (!activity.length) return null;
  return (
    <div
      className="flex flex-wrap items-start gap-2"
      aria-label="Response activity"
    >
      {activity.map((label) => {
        const compacted = label === "Context compacted";
        const Icon = compacted
          ? Minimize2
          : label.includes("web") || label === "Web searched"
          ? Globe2
          : Search;
        return compacted ? (
          <details
            key={label}
            className="group max-w-full rounded-lg border border-border bg-muted/20 text-xs"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {label}
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-sm border-t border-border px-3 py-2 leading-relaxed text-muted-foreground">
              Earlier context was compacted to make room for the conversation to
              continue.
            </p>
          </details>
        ) : (
          <span
            key={label}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
          >
            <Icon
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}
