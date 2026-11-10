"use client";

import { useState } from "react";
import { Download, Loader2, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type AnalysisJobView,
  downloadAnalysisReport,
  releaseCodeWorkspace,
  reportFilename,
  shouldPoll,
} from "@/lib/code-analysis";
import { saveBlob } from "@/lib/file-downloads";

type Action = "cancel" | "refresh" | "download" | "release";

export function CodeAnalysisJobActions({
  job,
  cancel,
  refresh,
}: {
  job: AnalysisJobView | null;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [acting, setActing] = useState<Action | null>(null);
  const [released, setReleased] = useState(false);
  const act = async (action: Action, operation: () => Promise<void>) => {
    setActing(action);
    try {
      await operation();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Action failed. Try again."
      );
    } finally {
      setActing(null);
    }
  };
  const download = async () => {
    if (!job?.report_id) return;
    saveBlob(
      await downloadAnalysisReport(job.report_id),
      reportFilename(job.report_id)
    );
  };
  const stopping = job?.status === "cancel_requested";
  return (
    <div className="flex flex-wrap gap-2">
      {job?.report_id && (
        <Button
          size="sm"
          disabled={acting !== null}
          onClick={() => void act("download", download)}
        >
          <Download
            data-icon="inline-start"
            aria-hidden="true"
          />
          {job.status === "succeeded"
            ? "Download report"
            : "Download partial report"}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={acting !== null}
        onClick={() => void act("refresh", refresh)}
      >
        <RotateCcw
          data-icon="inline-start"
          aria-hidden="true"
          className={
            acting === "refresh" ? "motion-safe:animate-spin" : undefined
          }
        />
        Refresh
      </Button>
      {job && shouldPoll(job.status) && (
        <Button
          variant="outline"
          size="sm"
          disabled={acting !== null || stopping}
          onClick={() => void act("cancel", cancel)}
        >
          {stopping || acting === "cancel" ? (
            <Loader2
              data-icon="inline-start"
              aria-hidden="true"
              className="motion-safe:animate-spin"
            />
          ) : (
            <Square
              data-icon="inline-start"
              aria-hidden="true"
            />
          )}
          {stopping ? "Stopping…" : "Cancel"}
        </Button>
      )}
      {job && !shouldPoll(job.status) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={acting !== null || released}
          onClick={() =>
            void act("release", async () => {
              await releaseCodeWorkspace();
              setReleased(true);
              toast.success("Workspace released");
            })
          }
        >
          <X
            data-icon="inline-start"
            aria-hidden="true"
          />
          {released ? "Workspace released" : "Release workspace"}
        </Button>
      )}
    </div>
  );
}
