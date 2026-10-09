import type { Message } from "@langchain/langgraph-sdk";
import { responsesDetails } from "@/lib/responses-details";

/** Show citations, hosted tool activity, refusals and incomplete response status. */
export function ResponseDetails({ message }: { message: Message }) {
  const { sources, refusals, activity, notice } = responsesDetails(message);
  if (!sources.length && !refusals.length && !activity.length && !notice)
    return null;
  return (
    <div className="mt-3 flex flex-col gap-3 text-sm">
      {refusals.map((refusal, index) => (
        <p
          key={index}
          className="whitespace-pre-wrap text-foreground"
        >
          {refusal}
        </p>
      ))}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-foreground"
        >
          {notice}
        </p>
      )}
      {activity.length > 0 && (
        <p className="text-xs text-muted-foreground">{activity.join(" · ")}</p>
      )}
      {sources.length > 0 && (
        <nav
          aria-label="Response sources"
          className="rounded-lg border border-border/60 px-3 py-2"
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Sources
          </p>
          <ol className="list-inside list-decimal space-y-1">
            {sources.map((source, index) => (
              <li
                key={source.url ?? `${source.title}-${index}`}
                className="break-words"
              >
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {source.title}
                  </a>
                ) : (
                  <span>{source.title}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
