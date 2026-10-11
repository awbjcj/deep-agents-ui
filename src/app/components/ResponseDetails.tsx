import type { Message } from "@langchain/langgraph-sdk";
import { responsesDetails } from "@/lib/responses-details";
import { fileBlob, fileMetadata, saveBlob } from "@/lib/file-downloads";
import { fileContentToText } from "@/lib/uploads";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponseActivity } from "./ResponseActivity";
import { ResponseSources } from "./ResponseSources";

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
      <ResponseSources sources={sources} />
    </div>
  );
}
