"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  ACCEPT_ATTR,
  SUPPORTED_DOC_EXTS,
  SUPPORTED_IMAGE_EXTS,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_PER_SEND,
  deleteUpload,
  uploadFile,
  type UploadResponse,
} from "@/lib/uploads";

export type AttachmentState =
  | { phase: "uploading"; localId: string; file: File }
  | { phase: "ready"; localId: string; meta: UploadResponse }
  | { phase: "error"; localId: string; file: File; error: string };

interface UseAttachmentsOpts {
  threadId: string | null;
}

const ALL_EXTS = new Set<string>([
  ...SUPPORTED_DOC_EXTS,
  ...SUPPORTED_IMAGE_EXTS,
]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function useAttachments({ threadId }: UseAttachmentsOpts) {
  const [items, setItems] = useState<AttachmentState[]>([]);
  const aborters = useRef(new Map<string, AbortController>());

  // Switching threads clears the buffer entirely.
  useEffect(() => {
    aborters.current.forEach((c) => c.abort());
    aborters.current.clear();
    setItems([]);
  }, [threadId]);

  const update = useCallback(
    (localId: string, next: AttachmentState | null) => {
      setItems((prev) => {
        if (next === null) {
          return prev.filter((it) => it.localId !== localId);
        }
        return prev.map((it) => (it.localId === localId ? next : it));
      });
    },
    [],
  );

  const beginUpload = useCallback(
    async (item: { localId: string; file: File }) => {
      if (!threadId) {
        update(item.localId, {
          phase: "error",
          localId: item.localId,
          file: item.file,
          error: "Send a message first to create a thread, then re-attach.",
        });
        return;
      }
      const controller = new AbortController();
      aborters.current.set(item.localId, controller);
      try {
        const meta = await uploadFile(threadId, item.file, controller.signal);
        update(item.localId, { phase: "ready", localId: item.localId, meta });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Upload failed";
        update(item.localId, {
          phase: "error",
          localId: item.localId,
          file: item.file,
          error: msg,
        });
        toast.error(`Upload failed: ${item.file.name}`, { description: msg });
      } finally {
        aborters.current.delete(item.localId);
      }
    },
    [threadId, update],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setItems((prev) => {
        const remaining = UPLOAD_MAX_PER_SEND - prev.length;
        if (remaining <= 0) {
          toast.warning(`Max ${UPLOAD_MAX_PER_SEND} attachments per message.`);
          return prev;
        }
        const accepted: Array<{ state: AttachmentState; file: File }> = [];
        for (const file of incoming.slice(0, remaining)) {
          const ext = extOf(file.name);
          if (!ALL_EXTS.has(ext)) {
            toast.error(`Unsupported file type: ${file.name}`);
            continue;
          }
          if (file.size > UPLOAD_MAX_BYTES) {
            toast.error(`Too large (>25 MB): ${file.name}`);
            continue;
          }
          const localId = uuidv4();
          accepted.push({
            state: { phase: "uploading", localId, file },
            file,
          });
        }
        // Kick off uploads asynchronously after state commit.
        queueMicrotask(() =>
          accepted.forEach((a) =>
            beginUpload({ localId: a.state.localId, file: a.file }),
          ),
        );
        return [...prev, ...accepted.map((a) => a.state)];
      });
    },
    [beginUpload],
  );

  const remove = useCallback(
    (localId: string) => {
      const target = items.find((it) => it.localId === localId);
      if (!target) return;
      aborters.current.get(localId)?.abort();
      aborters.current.delete(localId);
      update(localId, null);
      if (
        target.phase === "ready" &&
        target.meta.state_files_key &&
        threadId
      ) {
        deleteUpload(threadId, target.meta.state_files_key).catch(() => {
          // Best-effort cleanup; user already moved on.
        });
      }
    },
    [items, threadId, update],
  );

  const clear = useCallback(() => {
    aborters.current.forEach((c) => c.abort());
    aborters.current.clear();
    setItems([]);
  }, []);

  const takeReady = useCallback((): UploadResponse[] => {
    const ready = items
      .filter(
        (it): it is Extract<AttachmentState, { phase: "ready" }> =>
          it.phase === "ready",
      )
      .map((it) => it.meta);
    setItems((prev) => prev.filter((it) => it.phase !== "ready"));
    return ready;
  }, [items]);

  const hasUploading = items.some((it) => it.phase === "uploading");

  return {
    items,
    addFiles,
    remove,
    clear,
    takeReady,
    hasUploading,
    accept: ACCEPT_ATTR,
  };
}
