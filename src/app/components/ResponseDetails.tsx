import type { Message } from "@langchain/langgraph-sdk";
import { responsesDetails } from "@/lib/responses-details";
import { fileBlob, fileMetadata, saveBlob } from "@/lib/file-downloads";
import { fileContentToText } from "@/lib/uploads";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponseActivity } from "./ResponseActivity";

/** Show citations, hosted tool activity, refusals and incomplete response status. */
export function ResponseDetails({
  message,
  files = {},
}: {
  message: Message;
  files?: Record<string, unknown>;
}) {
  const { sources, refusals, activity, notice } = responsesDetails(message);
  const metadata = message.response_metadata as
    | Record<string, unknown>
    | undefined;
  const generated = Array.isArray(metadata?.generated_files)
    ? metadata.generated_files
        .filter(
          (item): item is { path: string; filename: string } =>
            !!item &&
            typeof item.path === "string" &&
            typeof item.filename === "string"
        )
        .slice(0, 10)
    : [];
  const errors = Array.isArray(metadata?.generated_file_errors)
    ? metadata.generated_file_errors
        .filter((item): item is string => typeof item === "string")
        .slice(0, 10)
    : [];
  if (
    !sources.length &&
    !refusals.length &&
    !activity.length &&
    !notice &&
    !generated.length &&
    !errors.length
  )
    return null;
  return (
    <div className="mt-3 flex flex-col gap-3 text-sm">
      {generated.map((item) => (
        <Button
          key={item.path}
          type="button"
          disabled={!files[item.path]}
          variant="outline"
          className="h-auto min-h-10 max-w-full justify-start whitespace-normal text-left"
          onClick={() => {
            try {
              const value = files[item.path];
              const meta = fileMetadata(value);
              saveBlob(
                fileBlob(
                  fileContentToText(value),
                  meta.encoding,
                  meta.mimeType
                ),
                item.filename
              );
            } catch {
              toast.error("The generated file could not be downloaded.");
            }
          }}
        >
          <Download
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 break-all">Download {item.filename}</span>
        </Button>
      ))}
      {errors.map((error, index) => (
        <p
          key={index}
          role="status"
          className="text-muted-foreground"
        >
          {error}
        </p>
      ))}
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
      <ResponseActivity activity={activity} />
      {sources.length > 0 && (
        <nav
          aria-label="Response sources"
          className="min-w-0 rounded-xl border border-border bg-muted/15 p-3"
        >
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Globe2
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            Sources{" "}
            <span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">
              {sources.length}
            </span>
          </p>
          <ol className="grid min-w-0 gap-2 sm:grid-cols-2">
            {sources.map((source, index) => (
              <li
                key={source.url ?? `${source.title}-${index}`}
                className="min-w-0"
              >
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={source.title}
                    className="hover:border-primary/50 group flex h-full min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <span
                      className="mt-0.5 text-[10px] tabular-nums text-muted-foreground"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-xs font-medium leading-relaxed">
                        {source.title}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                        {new URL(source.url).hostname}
                      </span>
                    </span>
                    <ExternalLink
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </a>
                ) : (
                  <span className="flex h-full items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs">
                    <FileText
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="break-words">{source.title}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
