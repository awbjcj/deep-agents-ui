import { ChevronDown, Globe2, Minimize2, Search } from "lucide-react";

/** Explain provider activity without displaying private context or queries. */
export function ResponseActivity({ activity }: { activity: string[] }) {
  if (!activity.length) return null;
  return (
    <div
      className="flex flex-wrap items-start gap-x-4 gap-y-2 text-muted-foreground"
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
            className="group max-w-full rounded-lg border border-border/70 bg-muted/20 text-xs"
          >
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {label}
              <ChevronDown
                className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-sm border-t border-border/70 px-3 py-2.5 leading-relaxed text-muted-foreground">
              Earlier context was compacted to make room for the conversation to
              continue. You can keep chatting; no action is needed.
            </p>
          </details>
        ) : (
          <span
            key={label}
            className="inline-flex min-h-9 items-center gap-1.5 py-1.5 text-xs"
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}
