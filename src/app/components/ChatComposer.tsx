"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Square, ArrowUp, Paperclip, Upload, Link2 } from "lucide-react";
import type { Assistant } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { AttachmentsRow } from "@/app/components/AttachmentsRow";
import { ReferenceFileDialog } from "@/app/components/ReferenceFileDialog";
import { useAttachments } from "@/app/hooks/useAttachments";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useQueryState } from "nuqs";
import type { MessageAttachment } from "@/lib/uploads";

interface ChatComposerProps {
  assistant: Assistant | null;
  isLoading: boolean;
  files: Record<string, string>;
  sendMessage: (
    content: string | Array<Record<string, unknown>>,
    additionalKwargs?: Record<string, unknown>
  ) => void;
  stopStream: () => void;
  ensureThreadId: () => Promise<string | null>;
}

/**
 * The message composer: textarea, attachment menu, send/stop button, and the
 * reference-file dialog. Split out of `ChatInterface` as a memo'd module so
 * that (1) keystrokes re-render only this subtree instead of the whole chat
 * pane, and (2) streamed tokens — which re-render `ChatInterface` every frame —
 * skip the composer entirely because all of its props are referentially stable
 * across tokens (`isLoading`/`files` change only at run/file boundaries; the
 * callbacks are memoized in `useChat`).
 */
export const ChatComposer = React.memo<ChatComposerProps>(
  ({
    assistant,
    isLoading,
    files,
    sendMessage,
    stopStream,
    ensureThreadId,
  }) => {
    const [threadId] = useQueryState("threadId");
    const [input, setInput] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const attachMenuRef = useRef<HTMLDivElement | null>(null);

    const {
      items: attachments,
      addFiles,
      addReferences,
      remove: removeAttachment,
      takeAttachments,
      hasUploading,
      accept: acceptAttr,
    } = useAttachments({ threadId, ensureThreadId });

    // File/image attachments are unavailable while routing through the local
    // Proxy, so every entry point (button, menu, drag-and-drop) is gated on it.
    const { isProxyMode } = useConnectivity();

    const fileKeysCount = Object.keys(files).length;

    // Close the attach menu on outside click / Escape (mirrors AccountMenu).
    useEffect(() => {
      if (!attachMenuOpen) return;
      const handlePointerDown = (event: PointerEvent) => {
        if (!attachMenuRef.current?.contains(event.target as Node)) {
          setAttachMenuOpen(false);
        }
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setAttachMenuOpen(false);
      };
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [attachMenuOpen]);

    // Switching to Proxy mode with the attach menu open would leave a dangling
    // popover whose actions are all disabled — close it proactively.
    useEffect(() => {
      if (isProxyMode) setAttachMenuOpen(false);
    }, [isProxyMode]);

    const submitDisabled = isLoading || !assistant;
    // Adding attachments is blocked while a run is in flight, before an
    // assistant is selected, or whenever Proxy mode is active.
    const attachmentsDisabled = submitDisabled || isProxyMode;
    const sendDisabled =
      submitDisabled ||
      hasUploading ||
      (!input.trim() &&
        attachments.every(
          (a) => a.phase !== "ready" && a.phase !== "reference"
        ));

    const handleSubmit = useCallback(
      (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (hasUploading || submitDisabled) return;

        const messageText = input.trim();
        const resolved = takeAttachments();
        if (!messageText && resolved.length === 0) return;

        // Images are embedded inline as image_url blocks so the model can view
        // them. Every attachment (image or document) is also recorded on
        // additional_kwargs.attachments; the backend middleware reads those and
        // injects the artifact paths into the system prompt — no visible note
        // is written into the message text.
        const imageBlocks = resolved
          .filter((r) => r.imageUrl)
          .map((r) => ({
            type: "image_url",
            image_url: { url: r.imageUrl as string },
          }));
        const attachmentsKwarg: MessageAttachment[] = resolved.map((r) => ({
          path: r.path,
          name: r.filename,
          kind: r.kind,
          ...(r.detail ? { detail: r.detail } : {}),
        }));
        const additionalKwargs = attachmentsKwarg.length
          ? { attachments: attachmentsKwarg }
          : undefined;

        if (imageBlocks.length === 0) {
          // Documents-only or text-only. Keep a single space when the user sent
          // attachments without any text so the model still receives a turn.
          const text = messageText || (resolved.length ? " " : "");
          sendMessage(text, additionalKwargs);
        } else {
          sendMessage(
            [{ type: "text", text: messageText || " " }, ...imageBlocks],
            additionalKwargs
          );
        }
        setInput("");
      },
      [input, hasUploading, sendMessage, submitDisabled, takeAttachments]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (submitDisabled) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit, submitDisabled]
    );

    return (
      <>
        <form
          onSubmit={handleSubmit}
          className={`relative flex flex-col ${
            isDragging ? "ring-2 ring-primary/40" : ""
          }`}
          onDragOver={(e) => {
            if (isProxyMode) return;
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            if (isProxyMode) return;
            e.preventDefault();
            setIsDragging(false);
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length) addFiles(dropped);
          }}
        >
          <AttachmentsRow
            items={attachments}
            onRemove={removeAttachment}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Running..." : "Write your message..."}
            className="font-inherit field-sizing-content flex-1 resize-none border-0 bg-transparent px-[18px] pb-[13px] pt-[14px] text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground"
            rows={1}
          />
          <div className="flex items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptAttr}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    addFiles(Array.from(e.target.files));
                  }
                  e.target.value = "";
                }}
              />
              <div
                ref={attachMenuRef}
                className="relative"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach files"
                  aria-haspopup="menu"
                  aria-expanded={attachMenuOpen}
                  onClick={() => setAttachMenuOpen((v) => !v)}
                  disabled={attachmentsDisabled}
                  title={
                    isProxyMode
                      ? "Attachments are unavailable in Proxy mode"
                      : undefined
                  }
                >
                  <Paperclip size={18} />
                </Button>
                {attachMenuOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-[80] mb-2 w-64 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md duration-150 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-primary/5 focus-visible:bg-primary/5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--color-primary)] transition-colors group-hover:bg-primary/15">
                        <Upload className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          Upload file
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          From your computer
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={fileKeysCount === 0}
                      onClick={() => {
                        setAttachMenuOpen(false);
                        setReferenceDialogOpen(true);
                      }}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      title={
                        fileKeysCount === 0
                          ? "No files in this conversation yet"
                          : undefined
                      }
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--color-primary)] transition-colors group-hover:bg-primary/15">
                        <Link2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          Reference existing file
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {fileKeysCount === 0
                            ? "No files in this chat yet"
                            : `Reuse one of ${fileKeysCount} file${
                                fileKeysCount > 1 ? "s" : ""
                              } in this chat`}
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <Button
              type={isLoading ? "button" : "submit"}
              variant={isLoading ? "destructive" : "default"}
              size="default"
              onClick={isLoading ? stopStream : handleSubmit}
              aria-label={isLoading ? "Stop" : "Send message"}
              className={cn(
                "rounded-full px-4 font-medium transition-all duration-150",
                !isLoading &&
                  "bg-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-hover)] hover:shadow-md active:translate-y-px disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
              )}
              disabled={!isLoading && sendDisabled}
            >
              {isLoading ? (
                <>
                  <Square size={14} />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <ArrowUp
                    size={16}
                    strokeWidth={2.5}
                  />
                </>
              )}
            </Button>
          </div>
        </form>
        <ReferenceFileDialog
          open={referenceDialogOpen}
          onOpenChange={setReferenceDialogOpen}
          files={files}
          onConfirm={addReferences}
        />
      </>
    );
  }
);

ChatComposer.displayName = "ChatComposer";
