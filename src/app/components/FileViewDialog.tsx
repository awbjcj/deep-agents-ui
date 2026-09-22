"use client";

import React, { useMemo, useCallback, useState } from "react";
import {
  Copy,
  Download,
  Edit,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileContentView } from "@/app/components/FileContentView";
import type { FileItem } from "@/app/types/types";
import { imageMimeForPath } from "@/lib/uploads";
import { safeSourcePageUrl, SOURCE_IMAGE_LABELS } from "@/lib/source-images";

interface FileViewDialogProps {
  file: FileItem | null;
  onSaveFile: (fileName: string, content: string) => Promise<void>;
  onClose: () => void;
  editDisabled: boolean;
}

export const FileViewDialog = React.memo(function FileViewDialog(
  props: FileViewDialogProps
) {
  return (
    <FileViewDialogSession
      key={props.file?.path ?? "new-file"}
      {...props}
    />
  );
});

function FileViewDialogSession({
  file,
  onSaveFile,
  onClose,
  editDisabled,
}: FileViewDialogProps) {
  const [isEditingMode, setIsEditingMode] = useState(file === null);
  const [fileName, setFileName] = useState(String(file?.path || ""));
  const [fileContent, setFileContent] = useState(String(file?.content || ""));

  const [isSaving, setIsSaving] = useState(false);
  // Read directly from the current graph snapshot; only edits need a draft.
  const displayedContent = isEditingMode
    ? fileContent
    : file?.content ?? fileContent;

  const imageMime = useMemo<string | null>(
    () => imageMimeForPath(fileName),
    [fileName]
  );
  const isImage = imageMime !== null;
  const sourceImage = file?.sourceImage;
  const displayName = sourceImage?.filename || file?.path || "New File";
  const sourcePageUrl = sourceImage
    ? safeSourcePageUrl(sourceImage.source_page_url)
    : null;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayedContent);
      toast.success("File copied");
    } catch {
      toast.error("Could not copy the file. Try downloading it instead.");
    }
  }, [displayedContent]);

  const handleDownload = useCallback(() => {
    if (displayName) {
      let blob: Blob;
      if (isImage && imageMime) {
        // Image content is base64; decode to real bytes so the download is a
        // valid image rather than a text file full of base64.
        const byteChars = atob(displayedContent);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          bytes[i] = byteChars.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: imageMime });
      } else {
        blob = new Blob([displayedContent], {
          type: "text/plain;charset=utf-8",
        });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = displayName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [displayName, displayedContent, isImage, imageMime]);

  const handleEdit = useCallback(() => {
    setFileContent(file?.content ?? "");
    setIsEditingMode(true);
  }, [file?.content]);

  const handleCancel = useCallback(() => {
    if (file === null) {
      onClose();
    } else {
      setFileName(String(file.path));
      setFileContent(String(file.content));
      setIsEditingMode(false);
    }
  }, [file, onClose]);

  const fileNameIsValid = useMemo(() => {
    return (
      file !== null ||
      (fileName.trim() !== "" &&
        !fileName.includes("/") &&
        !fileName.includes("\\") &&
        !fileName.includes(" "))
    );
  }, [file, fileName]);

  const handleSave = async () => {
    if (isSaving || editDisabled || !fileNameIsValid) return;
    setIsSaving(true);
    try {
      await onSaveFile(fileName, fileContent);
      setIsEditingMode(false);
    } catch (error) {
      toast.error(`Failed to save file: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="flex h-[min(80dvh,760px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] min-w-0 max-w-5xl flex-col p-4 sm:min-w-[60vw] sm:p-6">
        <DialogTitle className="sr-only">{displayName}</DialogTitle>
        <DialogDescription className="sr-only">
          {file
            ? sourceImage
              ? `View, copy, or download ${displayName}.`
              : `View, copy, download, or edit ${file.path}.`
            : "Create a new file by entering a file name and content."}
        </DialogDescription>
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--color-primary)]">
              {sourceImage ? (
                <ImageIcon
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              ) : (
                <FileText
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              )}
            </span>
            {isEditingMode && file === null ? (
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter filename..."
                className="text-base font-medium"
                aria-invalid={!fileNameIsValid}
                aria-label="File name"
                disabled={isSaving}
              />
            ) : (
              <div className="min-w-0">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium text-primary">
                  {displayName}
                </span>
                {sourceImage && (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="bg-primary/8 rounded-full px-1.5 py-0.5 font-semibold text-[var(--color-primary)]">
                      {SOURCE_IMAGE_LABELS[sourceImage.source]} source image
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5">
                      {sourceImage.embedded ? "Embedded" : "Attachment"}
                    </span>
                    {sourceImage.optimized_copy && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5">
                        Optimized for model
                      </span>
                    )}
                    {sourcePageUrl && (
                      <a
                        href={sourcePageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Open source
                        <ExternalLink
                          aria-hidden="true"
                          className="h-2.5 w-2.5"
                        />
                      </a>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 self-end min-[520px]:self-auto">
            {!isEditingMode && (
              <>
                {!isImage && (
                  <Button
                    onClick={handleEdit}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={editDisabled}
                  >
                    <Edit
                      size={16}
                      className="mr-1"
                    />
                    Edit
                  </Button>
                )}
                {!isImage && (
                  <Button
                    onClick={handleCopy}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                  >
                    <Copy
                      size={16}
                      className="mr-1"
                    />
                    Copy
                  </Button>
                )}
                <Button
                  onClick={handleDownload}
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                >
                  <Download
                    size={16}
                    className="mr-1"
                  />
                  Download
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {isEditingMode ? (
            <Textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder="Enter file content..."
              aria-label="File content"
              readOnly={isSaving}
              className="h-full min-h-0 resize-none font-mono text-sm"
            />
          ) : (
            <ScrollArea className="h-full rounded-xl border border-border/60 bg-muted/20 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <div className="p-4">
                {displayedContent ? (
                  isImage && imageMime ? (
                    <div className="flex min-h-[min(52dvh,520px)] items-center justify-center p-4 sm:p-8">
                      <img
                        src={`data:${imageMime};base64,${displayedContent}`}
                        alt={displayName}
                        className="max-h-[52dvh] max-w-full rounded-lg border border-border/60 bg-background object-contain shadow-sm"
                      />
                    </div>
                  ) : (
                    <FileContentView
                      content={displayedContent}
                      path={fileName}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center p-12">
                    <p className="text-sm text-muted-foreground">
                      File is empty
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
        {isEditingMode && (
          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              disabled={isSaving}
            >
              <X
                size={16}
                className="mr-1"
              />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={isSaving || editDisabled || !fileNameIsValid}
            >
              {isSaving ? (
                <Loader2
                  size={16}
                  className="mr-1 animate-spin"
                />
              ) : (
                <Save
                  size={16}
                  className="mr-1"
                />
              )}
              Save
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

FileViewDialog.displayName = "FileViewDialog";
