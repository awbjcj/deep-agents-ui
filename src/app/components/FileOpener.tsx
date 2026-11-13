"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { FileViewDialog } from "@/app/components/FileViewDialog";
import {
  resolveConversationFile,
  type SourceAttachmentRecord,
} from "@/lib/artifact-links";
import type { SourceImageRecord } from "@/lib/source-images";

export interface FileOpener {
  open(path: string): void;
}

const FileOpenerContext = createContext<FileOpener | null>(null);

/**
 * The chat's file opener, or null outside a chat. Without one, conversation
 * file links keep their download behaviour.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFileOpener(): FileOpener | null {
  return useContext(FileOpenerContext);
}

const saveNothing = async () => {};

/**
 * Lets any message open a conversation file in one shared, read-only
 * FileViewDialog. The opener's identity never changes, so providing it does
 * not re-render memoized messages when files stream in.
 */
export function FileOpenerProvider({
  files,
  sourceImageAttachments,
  sourceAttachmentRecords,
  children,
}: {
  files: Record<string, unknown>;
  sourceImageAttachments: Record<string, SourceImageRecord>;
  sourceAttachmentRecords: Record<string, SourceAttachmentRecord>;
  children: React.ReactNode;
}) {
  const [path, setPath] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const open = useCallback((next: string) => {
    if (!Object.hasOwn(filesRef.current, next)) {
      toast.error("This file is not available in this conversation.");
      return;
    }
    setPath(next);
  }, []);
  const opener = useMemo<FileOpener>(() => ({ open }), [open]);
  const close = useCallback(() => setPath(null), []);

  const file = useMemo(
    () =>
      path === null
        ? null
        : resolveConversationFile(
            path,
            files,
            sourceImageAttachments,
            sourceAttachmentRecords
          ).file,
    [path, files, sourceImageAttachments, sourceAttachmentRecords]
  );

  return (
    <FileOpenerContext.Provider value={opener}>
      {children}
      {file && (
        <FileViewDialog
          file={file}
          onSaveFile={saveNothing}
          onClose={close}
          editDisabled
        />
      )}
    </FileOpenerContext.Provider>
  );
}
