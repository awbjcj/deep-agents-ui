"use client";

import { useId } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { responsesDetails } from "@/lib/responses-details";
import { fileBlob, fileMetadata, saveBlob } from "@/lib/file-downloads";
import { fileContentToText } from "@/lib/uploads";
import { toast } from "sonner";
import { CircleAlert, Download, FileText } from "lucide-react";
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
  const sourceListId = useId();
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
    <div className="mt-4 flex min-w-0 flex-col gap-3 text-sm">
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-foreground"
        >
          <CircleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-warning)]"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold">
              {metadata?.status === "failed"
                ? "Response interrupted"
                : "Response incomplete"}
            </p>
            <p className="text-xs leading-relaxed">{notice}</p>
          </div>
        </div>
      )}
      {generated.length > 0 && (
        <section
          aria-label="Generated files"
          className="space-y-2"
        >
          <p className="text-xs font-medium text-muted-foreground">
            Generated files{" "}
            <span className="ml-1 tabular-nums">{generated.length}</span>
          </p>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {generated.map((item, index) => {
              const available =
                files[item.path] !== undefined && files[item.path] !== null;
              return (
                <Button
                  key={item.path}
                  type="button"
                  disabled={!available}
                  aria-label={`Download ${item.filename}`}
                  aria-describedby={`${sourceListId}-file-${index}`}
                  variant="outline"
                  className="h-auto min-h-16 min-w-0 max-w-full justify-start gap-3 whitespace-normal rounded-xl p-3 text-left disabled:opacity-70"
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
                      toast.error(
                        "The generated file could not be downloaded."
                      );
                    }
                  }}
                >
                  <FileText
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-xs font-medium">
                      {item.filename}
                    </span>
                    <span
                      id={`${sourceListId}-file-${index}`}
                      className="mt-1 block text-[11px] font-normal text-muted-foreground"
                    >
                      {available
                        ? "Ready to download"
                        : "File unavailable in this conversation"}
                    </span>
                  </span>
                  <Download
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Button>
              );
            })}
          </div>
        </section>
      )}
      {errors.map((error, index) => (
        <p
          key={index}
          role="status"
          className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
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
      <ResponseActivity activity={activity} />
      <ResponseSources sources={sources} />
    </div>
  );
}
