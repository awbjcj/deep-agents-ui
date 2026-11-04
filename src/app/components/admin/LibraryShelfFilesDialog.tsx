"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { FileUp, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { LibraryShelfFileList } from "@/app/components/admin/LibraryShelfFileList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  apiDeleteLibraryShelfFile,
  apiListLibraryShelfFiles,
  apiUploadLibraryShelfFiles,
  type LibraryFile,
  type LibraryJob,
} from "@/lib/library-admin";
import { sortLibraryFiles } from "@/lib/library-file-view";

const ACCEPTED_FILES = ".pdf,.docx,.pptx,.xlsx,.html,.htm,.txt,.md,.msg";
const PENDING_REFRESH_MS = 5000;

interface LibraryShelfFilesDialogProps {
  shelfId: string;
  fileCount: number;
  mutationsDisabled: boolean;
  onTrackJob: (job: LibraryJob) => void;
  onChanged: () => Promise<void>;
}

export function LibraryShelfFilesDialog({
  shelfId,
  fileCount,
  mutationsDisabled,
  onTrackJob,
  onChanged,
}: LibraryShelfFilesDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LibraryFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        setFiles(
          sortLibraryFiles(await apiListLibraryShelfFiles(shelfId, signal))
        );
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load shelf files"
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shelfId]
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, open]);

  // Uploads are converted by the shelf's background sync job, so refresh
  // while any file is still pending to show it become ready or failed.
  const hasPending = files.some((file) => file.status === "pending");
  useEffect(() => {
    if (!open || !hasPending) return;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      try {
        setFiles(
          sortLibraryFiles(
            await apiListLibraryShelfFiles(shelfId, controller.signal)
          )
        );
      } catch {
        // A failed refresh keeps the last list; the next tick retries.
      }
    }, PENDING_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [hasPending, open, shelfId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;
    setUploading(true);
    try {
      const result = await apiUploadLibraryShelfFiles(shelfId, selected);
      onTrackJob(result.job);
      toast.success(
        `${selected.length} ${
          selected.length === 1 ? "file" : "files"
        } added; conversion and indexing queued`
      );
      await Promise.all([load(), onChanged()]);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "File upload failed"
      );
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await apiDeleteLibraryShelfFile(
        shelfId,
        deleteTarget.file_id
      );
      onTrackJob(result.job);
      toast.success(`Removed “${deleteTarget.filename}”; index cleanup queued`);
      setDeleteTarget(null);
      await Promise.all([load(), onChanged()]);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not delete file"
      );
    } finally {
      setDeleting(false);
    }
  };

  const locked = mutationsDisabled || uploading || deleting;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
          >
            <FolderOpen />
            Files
            <span className="font-mono text-[10px] text-muted-foreground">
              {fileCount}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage shelf files</DialogTitle>
            <DialogDescription>
              Upload searchable documents to {shelfId}. Changes are indexed as a
              managed library job.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILES}
            multiple
            className="sr-only"
            aria-label="Choose files for the library shelf"
            onChange={(event) => void handleUpload(event)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={locked}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
            {uploading ? "Uploading files" : "Upload documents"}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            PDF, Word, PowerPoint, Excel, HTML, Markdown, text, and Outlook
            message files are supported. Up to 20 files per upload, 25 MB each.
          </p>

          <LibraryShelfFileList
            files={files}
            loading={loading}
            error={error}
            mutationsDisabled={locked}
            onDelete={setDeleteTarget}
          />
        </DialogContent>
      </Dialog>

      <LibraryConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && !deleting && setDeleteTarget(null)}
        title="Delete this shelf file?"
        description={
          deleteTarget
            ? `“${deleteTarget.filename}” will be removed from the shelf and its search chunks will be tombstoned when the queued sync completes.`
            : ""
        }
        confirmationLabel="Delete file"
        isPending={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
