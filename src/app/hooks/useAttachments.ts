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
  | { phase: "ready"; localId: string; meta: UploadResponse; threadId: string }
  | { phase: "error"; localId: string; file: File; error: string };

interface UseAttachmentsOpts {
  threadId: string | null;
  ensureThreadId: () => Promise<string | null>;
}

const ALL_EXTS = new Set<string>([
  ...SUPPORTED_DOC_EXTS,
  ...SUPPORTED_IMAGE_EXTS,
]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function useAttachments({
  threadId,
  ensureThreadId,
}: UseAttachmentsOpts) {
  const [items, setItems] = useState<AttachmentState[]>([]);
  const aborters = useRef(new Map<string, AbortController>());
  const previousThreadId = useRef<string | null>(null);
  const itemsRef = useRef<AttachmentState[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Switching away from an existing thread clears in-flight chips.
  // null -> string is initial thread creation; keep attachments in place.
  useEffect(() => {
    if (
      previousThreadId.current !== null &&
      previousThreadId.current !== threadId
    ) {
      const readyItems = itemsRef.current.filter(
        (item): item is Extract<AttachmentState, { phase: "ready" }> =>
          item.phase === "ready"
      );
      readyItems.forEach((item) => {
        if (!item.meta.state_files_key) return;
        void deleteUpload(item.threadId, item.meta.state_files_key).catch(() => {
          // Best-effort cleanup; user already moved on.
        });
      });
      aborters.current.forEach((c) => c.abort());
      aborters.current.clear();
      setItems([]);
    }
    previousThreadId.current = threadId;
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
    []
  );

  const beginUpload = useCallback(
    async (item: { localId: string; file: File }) => {
      const controller = new AbortController();
      aborters.current.set(item.localId, controller);
      try {
        const uploadThreadId = threadId ?? (await ensureThreadId());
        if (controller.signal.aborted) return;
        if (!uploadThreadId) {
          throw new Error("Create a thread before uploading files.");
        }
        const meta = await uploadFile(
          uploadThreadId,
          item.file,
          controller.signal
        );
        update(item.localId, {
          phase: "ready",
          localId: item.localId,
          meta,
          threadId: uploadThreadId,
        });
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
    [ensureThreadId, threadId, update]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const remaining = UPLOAD_MAX_PER_SEND - items.length;
      if (remaining <= 0) {
        toast.warning(`Max ${UPLOAD_MAX_PER_SEND} attachments per message.`);
        return;
      }

      const accepted: Array<{ state: AttachmentState; file: File }> = [];
      for (const file of incoming) {
        if (accepted.length >= remaining) {
          toast.warning(`Max ${UPLOAD_MAX_PER_SEND} attachments per message.`);
          break;
        }
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

      if (accepted.length === 0) return;

      setItems((prev) => [...prev, ...accepted.map((a) => a.state)]);
      accepted.forEach((a) => {
        void beginUpload({ localId: a.state.localId, file: a.file });
      });
    },
    [beginUpload, items.length]
  );

  const remove = useCallback(
    (localId: string) => {
      const target = items.find((it) => it.localId === localId);
      if (!target) return;
      aborters.current.get(localId)?.abort();
      aborters.current.delete(localId);
      update(localId, null);
      if (target.phase === "ready" && target.meta.state_files_key) {
        const stateFilesKey = target.meta.state_files_key;
        const cleanupThreadId = target.threadId;
        void (async () => {
          try {
            await deleteUpload(cleanupThreadId, stateFilesKey);
          } catch {
            // Best-effort cleanup; user already moved on.
          }
        })();
      }
    },
    [items, update]
  );

  const clear = useCallback(() => {
    aborters.current.forEach((c) => c.abort());
    aborters.current.clear();
    setItems([]);
  }, []);

  const takeReady = useCallback(
    (shouldConsume?: (item: UploadResponse) => boolean): UploadResponse[] => {
      const readyItems = items.filter(
        (it): it is Extract<AttachmentState, { phase: "ready" }> =>
          it.phase === "ready"
      );
      if (readyItems.length === 0) return [];

      if (!shouldConsume) {
        setItems((prev) => prev.filter((it) => it.phase !== "ready"));
        return readyItems.map((it) => it.meta);
      }

      const consumed = readyItems.filter((it) => shouldConsume(it.meta));
      if (consumed.length > 0) {
        const consumedIds = new Set(consumed.map((it) => it.localId));
        setItems((prev) => prev.filter((it) => !consumedIds.has(it.localId)));
      }
      return consumed.map((it) => it.meta);
    },
    [items]
  );

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
