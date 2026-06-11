"use client";

import React, {
  useMemo,
  useCallback,
  useState,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { FileText, Copy, Download, Edit, Save, X, Loader2 } from "lucide-react";
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
import { MarkdownContent } from "@/app/components/MarkdownContent";
import type { FileItem } from "@/app/types/types";
import useSWRMutation from "swr/mutation";

// Lazy: Prism + its theme together push ~300KB. We only need them when the
// user opens a non-markdown file in the viewer.
const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then((m) => ({ default: m.Prism }))
);
let oneDarkTheme: unknown = undefined;
import("react-syntax-highlighter/dist/esm/styles/prism").then((m) => {
  oneDarkTheme = m.oneDark;
});

// Above this size, line-numbered syntax highlighting becomes painful in the
// browser. Show truncated head with a "Download to view full" affordance.
const LARGE_FILE_BYTES = 250_000;

const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export const FileViewDialog = React.memo<{
  file: FileItem | null;
  onSaveFile: (fileName: string, content: string) => Promise<void>;
  onClose: () => void;
  editDisabled: boolean;
}>(({ file, onSaveFile, onClose, editDisabled }) => {
  const [isEditingMode, setIsEditingMode] = useState(file === null);
  const [fileName, setFileName] = useState(String(file?.path || ""));
  const [fileContent, setFileContent] = useState(String(file?.content || ""));

  const fileUpdate = useSWRMutation(
    { kind: "files-update", fileName, fileContent },
    async ({ fileName, fileContent }) => {
      if (!fileName || !fileContent) return;
      return await onSaveFile(fileName, fileContent);
    },
    {
      onSuccess: () => setIsEditingMode(false),
      onError: (error) => toast.error(`Failed to save file: ${error}`),
    }
  );

  useEffect(() => {
    setFileName(String(file?.path || ""));
    setFileContent(String(file?.content || ""));
    setIsEditingMode(file === null);
  }, [file]);

  const fileExtension = useMemo(() => {
    const fileNameStr = String(fileName || "");
    return fileNameStr.split(".").pop()?.toLowerCase() || "";
  }, [fileName]);

  const isMarkdown = useMemo(() => {
    return fileExtension === "md" || fileExtension === "markdown";
  }, [fileExtension]);

  const imageMime = useMemo<string | null>(() => {
    const map: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    return map[fileExtension] ?? null;
  }, [fileExtension]);
  const isImage = imageMime !== null;

  const language = useMemo(() => {
    return LANGUAGE_MAP[fileExtension] || "text";
  }, [fileExtension]);

  const handleCopy = useCallback(() => {
    if (fileContent) {
      navigator.clipboard.writeText(fileContent);
    }
  }, [fileContent]);

  const handleDownload = useCallback(() => {
    if (fileContent && fileName) {
      let blob: Blob;
      if (isImage && imageMime) {
        // Image content is base64; decode to real bytes so the download is a
        // valid image rather than a text file full of base64.
        const byteChars = atob(fileContent);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          bytes[i] = byteChars.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: imageMime });
      } else {
        blob = new Blob([fileContent], { type: "text/plain" });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [fileContent, fileName, isImage, imageMime]);

  const handleEdit = useCallback(() => {
    setIsEditingMode(true);
  }, []);

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
      fileName.trim() !== "" &&
      !fileName.includes("/") &&
      !fileName.includes(" ")
    );
  }, [fileName]);

  return (
    <Dialog
      open={true}
      onOpenChange={onClose}
    >
      <DialogContent className="flex h-[80vh] max-h-[80vh] min-w-[60vw] flex-col p-6">
        <DialogTitle className="sr-only">
          {file?.path || "New File"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {file
            ? `View, copy, download, or edit ${file.path}.`
            : "Create a new file by entering a file name and content."}
        </DialogDescription>
        <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="text-primary/50 h-5 w-5 shrink-0" />
            {isEditingMode && file === null ? (
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Enter filename..."
                className="text-base font-medium"
                aria-invalid={!fileNameIsValid}
              />
            ) : (
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium text-primary">
                {file?.path}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
              className="h-full min-h-[400px] resize-none font-mono text-sm"
            />
          ) : (
            <ScrollArea className="bg-surface h-full rounded-md">
              <div className="p-4">
                {fileContent ? (
                  isImage && imageMime ? (
                    <div className="flex items-center justify-center p-4">
                      <img
                        src={`data:${imageMime};base64,${fileContent}`}
                        alt={String(fileName)}
                        className="max-h-[60vh] max-w-full rounded-md object-contain"
                      />
                    </div>
                  ) : isMarkdown ? (
                    <div className="rounded-md p-6">
                      <MarkdownContent content={fileContent} />
                    </div>
                  ) : (
                    <FileCodeView
                      content={fileContent}
                      language={language}
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
            >
              <X
                size={16}
                className="mr-1"
              />
              Cancel
            </Button>
            <Button
              onClick={() => fileUpdate.trigger()}
              size="sm"
              disabled={
                fileUpdate.isMutating ||
                !fileName.trim() ||
                !fileContent.trim() ||
                !fileNameIsValid
              }
            >
              {fileUpdate.isMutating ? (
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
});

FileViewDialog.displayName = "FileViewDialog";

interface FileCodeViewProps {
  content: string;
  language: string;
}

// Memoized so toggling unrelated dialog state (edit mode flag, etc.) does not
// re-mount the heavy Prism subtree. Also handles the large-file truncation.
const FileCodeView = React.memo<FileCodeViewProps>(({ content, language }) => {
  const isLarge = content.length > LARGE_FILE_BYTES;
  const displayContent = useMemo(() => {
    if (!isLarge) return content;
    // Show the first ~250KB worth of lines; keep boundary on a line break.
    const slice = content.slice(0, LARGE_FILE_BYTES);
    const lastNewline = slice.lastIndexOf("\n");
    return slice.slice(0, lastNewline > 0 ? lastNewline : slice.length);
  }, [content, isLarge]);

  return (
    <>
      {isLarge && (
        <div className="border-warning/40 bg-warning/10 mb-3 rounded-md border px-3 py-2 text-xs text-foreground/80">
          File is {Math.round(content.length / 1024)} KB; showing the first{" "}
          {Math.round(displayContent.length / 1024)} KB. Use Download to view in
          full.
        </div>
      )}
      <Suspense
        fallback={
          <pre className="bg-surface-alt overflow-auto rounded-md p-4 font-mono text-sm">
            {displayContent}
          </pre>
        }
      >
        <SyntaxHighlighter
          language={language}
          style={oneDarkTheme as any}
          customStyle={{
            margin: 0,
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontFamily: "var(--font-family-mono)",
            fontWeight: 500,
            fontFeatureSettings: '"ss01", "cv11"',
          }}
          showLineNumbers
          wrapLines={true}
          lineProps={{ style: { whiteSpace: "pre-wrap" } }}
        >
          {displayContent}
        </SyntaxHighlighter>
      </Suspense>
    </>
  );
});

FileCodeView.displayName = "FileCodeView";
