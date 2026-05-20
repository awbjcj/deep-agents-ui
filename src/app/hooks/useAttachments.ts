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
  const deferredIds = useRef(new Set<string>());
  const previousThreadId = useRef<string | null>(null);

  // Only abort+clear when switching between two real threads.
  // null -> string: keep buffered uploads so they can be retried.
  useEffect(() => {
    if (
      previousThreadId.current !== null &&
      previousThreadId.current !== threadId
    ) {
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
    [],
  );

  const beginUpload = useCallback(
    async (item: { localId: string; file: File }) => {
      if (!threadId) {
        deferredIds.current.add(item.localId);
        return; // Stay in "uploading" phase; retried by the effect below.
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
        deferredIds.current.delete(item.localId);
      }
    },
    [threadId, update],
  );

  // Retry deferred uploads once threadId becomes available.
  useEffect(() => {
    if (!threadId) return;
    if (deferredIds.current.size === 0) return;
    // Snapshot then process so we don't iterate a mutating set.
    const ids = Array.from(deferredIds.current);
    ids.forEach((localId) => {
      const target = items.find((it) => it.localId === localId);
      if (target && target.phase === "uploading") {
        beginUpload({ localId, file: target.file });
      }
      deferredIds.current.delete(localId);
    });
  }, [threadId, items, beginUpload]);

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
    let ready: UploadResponse[] = [];
    setItems((prev) => {
      ready = prev
        .filter(
          (it): it is Extract<AttachmentState, { phase: "ready" }> =>
            it.phase === "ready",
        )
        .map((it) => it.meta);
      return prev.filter((it) => it.phase !== "ready");
    });
    return ready;
  }, []);

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
