"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Square,
  ArrowUp,
  Paperclip,
  Upload,
  Link2,
  CornerDownLeft,
  ListPlus,
} from "lucide-react";
import { AutopilotControl } from "./AutopilotControl";
import { MessageQueue } from "./MessageQueue";
import type { useQueuedMessages } from "@/app/hooks/useQueuedMessages";
import type { useAutopilot } from "@/app/hooks/useAutopilot";
import type { MessageDelivery } from "@/lib/message-delivery";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Assistant } from "@langchain/langgraph-sdk";
import { cn } from "@/lib/utils";
import { AttachmentsRow } from "@/app/components/AttachmentsRow";
import { ReferenceFileDialog } from "@/app/components/ReferenceFileDialog";
import { ResponseJobs } from "@/app/components/ResponseJobs";
import { useAttachments } from "@/app/hooks/useAttachments";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useQueryState } from "nuqs";
import type { MessageAttachment } from "@/lib/uploads";
import type { SourceImageRecord } from "@/lib/source-images";
import {
  skillAuthoringRequestMatches,
  type SkillAuthoringRequest,
} from "@/lib/skill-authoring-request";
import {
  matchSkillReferences,
  reconcileSkillReferences,
  submittedSkillReferences,
  type SkillReference,
} from "@/lib/skill-references";
import { useSkillReferenceCatalog } from "@/app/hooks/useSkillReferenceCatalog";
import { SkillReferenceInput } from "./skills/SkillReferenceInput";

interface MessageDraft {
  text: string;
  references: SkillReference[];
}
const EMPTY_DRAFT: MessageDraft = { text: "", references: [] };

interface ChatComposerProps {
  accountId?: string;
  createdThreadId?: string;
  queuedMessageCount?: number;
  messageQueue?: ReturnType<typeof useQueuedMessages>;
  isStopping?: boolean;
  skillAuthoringRequest?: SkillAuthoringRequest | null;
  onSkillAuthoringRequestConsumed?: (id: string) => void;
  evidenceRequest?: { text: string; threadId: string | null } | null;
  onEvidenceConsumed?: () => void;
  assistant: Assistant | null;
  isLoading: boolean;
  isThreadLoading?: boolean;
  autopilot?: ReturnType<typeof useAutopilot>;
  files: Record<string, string>;
  sourceImageAttachments: Record<string, SourceImageRecord>;
  sendMessage: (
    content: string | Array<Record<string, unknown>>,
    additionalKwargs?: Record<string, unknown>,
    delivery?: MessageDelivery
  ) => void | boolean | Promise<boolean>;
  stopStream: () => void;
  ensureThreadId: () => Promise<string | null>;
  /** Re-read thread files after an upload or delete completes server-side. */
  onThreadFilesChanged?: (threadId: string) => void;
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
    accountId,
    createdThreadId,
    queuedMessageCount = 0,
    messageQueue,
    isStopping = false,
    assistant,
    evidenceRequest,
    onEvidenceConsumed,
    skillAuthoringRequest,
    onSkillAuthoringRequestConsumed,
    isLoading,
    isThreadLoading = false,
    autopilot,
    files,
    sourceImageAttachments,
    sendMessage,
    stopStream,
    ensureThreadId,
    onThreadFilesChanged,
  }) => {
    const [threadId] = useQueryState("threadId");
    const [delivery, setDelivery] = useState<MessageDelivery>("queue");
    const [submitting, setSubmitting] = useState(false);
    const submissionRef = useRef(false);
    // Keep unsent text (including selected evidence) with its conversation.
    const [drafts, setDrafts] = useState<Record<string, MessageDraft>>({});
    const createdThreadRef = useRef(createdThreadId);
    createdThreadRef.current = createdThreadId;
    useEffect(() => {
      if (!createdThreadId) return;
      const source = `${accountId ?? ""}:new-thread`;
      const target = `${accountId ?? ""}:${createdThreadId}`;
      setDrafts((previous) => {
        if (!Object.hasOwn(previous, source)) return previous;
        const next = {
          ...previous,
          [target]: previous[target] ?? previous[source],
        };
        delete next[source];
        return next;
      });
    }, [accountId, createdThreadId]);
    const draftKey = `${accountId ?? ""}:${threadId ?? "new-thread"}`;
    const draft = drafts[draftKey] ?? EMPTY_DRAFT;
    const input = draft.text;
    const skillCatalog = useSkillReferenceCatalog(accountId);
    const skillReferences = useMemo(
      () => matchSkillReferences(input, skillCatalog.entries, draft.references),
      [input, skillCatalog.entries, draft.references]
    );
    const setInput = useCallback(
      (value: React.SetStateAction<string>) => {
        setDrafts((previous) => {
          const oldDraft = previous[draftKey] ?? EMPTY_DRAFT;
          const text =
            typeof value === "function" ? value(oldDraft.text) : value;
          return {
            ...previous,
            [draftKey]: {
              text,
              references: reconcileSkillReferences(
                oldDraft.text,
                text,
                oldDraft.references
              ),
            },
          };
        });
      },
      [draftKey]
    );
    const [isDragging, setIsDragging] = useState(false);
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const lastEvidenceRef = useRef<typeof evidenceRequest>(null);
    const handledSkillRequests = useRef(new Set<string>());
    const [pendingSkillRequest, setPendingSkillRequest] =
      useState<SkillAuthoringRequest | null>(null);
    const matchingPendingSkill =
      pendingSkillRequest &&
      skillAuthoringRequestMatches(pendingSkillRequest, accountId, threadId)
        ? pendingSkillRequest
        : null;
    useEffect(() => {
      if (
        pendingSkillRequest &&
        !skillAuthoringRequestMatches(pendingSkillRequest, accountId, threadId)
      )
        setPendingSkillRequest(null);
    }, [pendingSkillRequest, threadId, accountId]);
    useEffect(() => {
      if (
        !skillAuthoringRequest ||
        handledSkillRequests.current.has(skillAuthoringRequest.id)
      )
        return;
      handledSkillRequests.current.add(skillAuthoringRequest.id);
      if (
        skillAuthoringRequestMatches(skillAuthoringRequest, accountId, threadId)
      ) {
        if (input) setPendingSkillRequest(skillAuthoringRequest);
        else {
          setInput(skillAuthoringRequest.text);
          textareaRef.current?.focus();
        }
      }
      onSkillAuthoringRequestConsumed?.(skillAuthoringRequest.id);
    }, [
      skillAuthoringRequest,
      onSkillAuthoringRequestConsumed,
      accountId,
      threadId,
      input,
      setInput,
    ]);
    useEffect(() => {
      if (!evidenceRequest || lastEvidenceRef.current === evidenceRequest)
        return;
      lastEvidenceRef.current = evidenceRequest;
      if (evidenceRequest.threadId === threadId) {
        setInput((previous) =>
          previous
            ? `${previous}\n\n${evidenceRequest.text}`
            : evidenceRequest.text
        );
        textareaRef.current?.focus();
      }
      onEvidenceConsumed?.();
    }, [evidenceRequest, onEvidenceConsumed, threadId, setInput]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const attachMenuRef = useRef<HTMLDivElement | null>(null);

    const ensureAttachmentThreadId = useCallback(async () => {
      const id = await ensureThreadId();
      if (!threadId && id) {
        setDrafts((previous) => {
          if (!Object.hasOwn(previous, draftKey)) return previous;
          const next = {
            ...previous,
            [`${accountId ?? ""}:${id}`]: previous[draftKey],
          };
          delete next[draftKey];
          return next;
        });
      }
      return id;
    }, [ensureThreadId, threadId, draftKey, accountId]);

    const {
      items: attachments,
      addFiles,
      addReferences,
      remove: removeAttachment,
      prepareAttachments,
      hasUploading,
      accept: acceptAttr,
    } = useAttachments({
      threadId,
      ensureThreadId: ensureAttachmentThreadId,
      files,
      onFilesChanged: onThreadFilesChanged,
    });

    // Attachments are available in every run mode; under Proxy they follow an
    // admin switch surfaced by the connectivity endpoint. Every entry point
    // (button, menu, drag-and-drop) is gated on the same resolved flag.
    const { attachmentsEnabled } = useConnectivity();

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

    // Disabling attachments with the attach menu open would leave a dangling
    // popover whose actions are all disabled — close it proactively.
    useEffect(() => {
      if (!attachmentsEnabled) setAttachMenuOpen(false);
    }, [attachmentsEnabled]);

    const submitDisabled =
      isThreadLoading || !assistant || submitting || isStopping;
    const skillsPending = skillCatalog.loading && !!input.trim();
    // Adding attachments is blocked while a run is in flight, before an
    // assistant is selected, or when an admin has turned uploads off for the
    // user's current run mode.
    const attachmentsDisabled =
      submitDisabled || isLoading || !attachmentsEnabled;
    const hasDraft =
      !!input.trim() ||
      attachments.some((a) => a.phase === "ready" || a.phase === "reference");
    const hasQueue = (messageQueue?.items.length ?? 0) > 0;
    const showDelivery = (isLoading || hasQueue) && hasDraft;
    const sendDisabled =
      submitDisabled ||
      skillsPending ||
      hasUploading ||
      (!input.trim() &&
        attachments.every(
          (a) => a.phase !== "ready" && a.phase !== "reference"
        ));

    const handleSubmit = useCallback(
      async (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (
          submissionRef.current ||
          hasUploading ||
          submitDisabled ||
          skillsPending
        )
          return;

        const messageText = input.trim();
        const prepared = prepareAttachments();
        const resolved = prepared.attachments;
        if (!messageText && resolved.length === 0) {
          prepared.release();
          return;
        }

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
          ...(r.source_image_ref
            ? { source_image_ref: r.source_image_ref }
            : {}),
        }));
        const submittedReferences = submittedSkillReferences(
          input,
          skillReferences
        );
        const additionalKwargs = {
          ...(attachmentsKwarg.length ? { attachments: attachmentsKwarg } : {}),
          ...(submittedReferences.length
            ? { skill_references: submittedReferences }
            : {}),
        };

        submissionRef.current = true;
        setSubmitting(true);
        try {
          let accepted;
          if (imageBlocks.length === 0) {
            // Documents-only or text-only. Keep a single space when the user sent
            // attachments without any text so the model still receives a turn.
            const text = messageText || (resolved.length ? " " : "");
            accepted = await sendMessage(
              text,
              additionalKwargs,
              isLoading || hasQueue ? delivery : undefined
            );
          } else {
            accepted = await sendMessage(
              [{ type: "text", text: messageText || " " }, ...imageBlocks],
              additionalKwargs,
              isLoading || hasQueue ? delivery : undefined
            );
          }
          if (accepted !== false) {
            prepared.commit();
            // Preserve text typed while the request was being accepted.
            setDrafts((previous) => {
              const keys = [draftKey];
              if (!threadId && createdThreadRef.current)
                keys.push(`${accountId ?? ""}:${createdThreadRef.current}`);
              const next = { ...previous };
              for (const key of keys) {
                if (next[key]?.text === input) next[key] = EMPTY_DRAFT;
              }
              return next;
            });
          }
        } finally {
          prepared.release();
          submissionRef.current = false;
          setSubmitting(false);
        }
      },
      [
        input,
        skillReferences,
        hasUploading,
        sendMessage,
        submitDisabled,
        skillsPending,
        prepareAttachments,
        isLoading,
        hasQueue,
        delivery,
        draftKey,
        threadId,
        accountId,
      ]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (submitDisabled) return;
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit, submitDisabled]
    );

    return (
      <>
        {messageQueue && <MessageQueue queue={messageQueue} />}
        <form
          onSubmit={handleSubmit}
          className={`relative flex flex-col ${
            isDragging ? "ring-2 ring-primary/40" : ""
          }`}
          onDragOver={(e) => {
            if (attachmentsDisabled) return;
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            if (attachmentsDisabled) return;
            e.preventDefault();
            setIsDragging(false);
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length) addFiles(dropped);
          }}
        >
          {matchingPendingSkill && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm"
            >
              <p className="min-w-0 flex-1">
                Keep your message and append the skill authoring request?
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (
                    !skillAuthoringRequestMatches(
                      matchingPendingSkill,
                      accountId,
                      threadId
                    )
                  )
                    return;
                  setInput((previous) =>
                    previous
                      ? `${previous}\n\n${matchingPendingSkill.text}`
                      : matchingPendingSkill.text
                  );
                  setPendingSkillRequest(null);
                  textareaRef.current?.focus();
                }}
                aria-label="Append skill request"
              >
                Append
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPendingSkillRequest(null)}
                aria-label="Cancel skill request"
              >
                Cancel
              </Button>
            </div>
          )}
          <AttachmentsRow
            items={attachments}
            onRemove={removeAttachment}
            disabled={submitting}
          />
          <SkillReferenceInput
            key={accountId}
            accountId={accountId}
            inputRef={textareaRef}
            value={input}
            references={skillReferences}
            catalog={skillCatalog.entries}
            catalogLoading={skillCatalog.loading}
            catalogError={skillCatalog.error}
            onRefreshCatalog={skillCatalog.refresh}
            isLoading={isLoading}
            onChange={setInput}
            onSelect={(text, references) =>
              setDrafts((previous) => ({
                ...previous,
                [draftKey]: { text, references },
              }))
            }
            onKeyDown={handleKeyDown}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                    !attachmentsEnabled
                      ? "Attachments have been disabled by an administrator"
                      : undefined
                  }
                >
                  <Paperclip size={18} />
                </Button>
                {attachMenuOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-full left-0 z-[80] mb-2 w-64 origin-bottom-left overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-1"
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
              {autopilot && (
                <AutopilotControl
                  key={`${accountId}:${threadId}:${assistant?.assistant_id}`}
                  autopilot={autopilot}
                  ready={!!threadId && !!assistant && !isThreadLoading}
                  unavailableReason={
                    !assistant
                      ? "Select an agent to enable autopilot."
                      : !threadId
                      ? "Start a conversation to enable autopilot."
                      : "Loading conversation…"
                  }
                />
              )}
              <ResponseJobs
                key={threadId}
                threadId={threadId}
              />
              {queuedMessageCount > 0 ? (
                <span
                  role="status"
                  className="whitespace-nowrap text-xs text-muted-foreground"
                >
                  {queuedMessageCount} queued
                </span>
              ) : (
                <span className="hidden text-xs text-muted-foreground lg:inline">
                  Type{" "}
                  <kbd className="rounded border border-border px-1">$</kbd> for
                  skills
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {showDelivery && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Stop"
                    title="Stop this run and queued messages"
                    onClick={stopStream}
                    className="h-8 w-8 text-muted-foreground"
                  >
                    <Square
                      size={14}
                      aria-hidden="true"
                    />
                  </Button>
                  <Select
                    value={delivery}
                    onValueChange={(value) =>
                      setDelivery(value as MessageDelivery)
                    }
                  >
                    <SelectTrigger
                      aria-label="Message delivery"
                      className="h-8 w-8 justify-center rounded-full border-0 p-0 [&>svg]:h-3.5 [&>svg]:w-3.5"
                      title="Choose when to send"
                    />
                    <SelectContent
                      side="top"
                      align="end"
                      className="!animate-none"
                    >
                      <SelectItem value="queue">
                        Queue · after this run
                      </SelectItem>
                      <SelectItem value="steer">Steer · send now</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <Button
                type={isLoading && !showDelivery ? "button" : "submit"}
                variant={isLoading && !showDelivery ? "destructive" : "default"}
                size="default"
                onClick={isLoading && !showDelivery ? stopStream : undefined}
                aria-label={
                  showDelivery
                    ? delivery === "queue"
                      ? "Queue message"
                      : "Steer now"
                    : isLoading
                    ? "Stop"
                    : "Send message"
                }
                title={
                  showDelivery
                    ? delivery === "queue"
                      ? "Send after the current run finishes"
                      : "Interrupt the current response and send this user prompt now"
                    : undefined
                }
                className={cn(
                  "rounded-full px-4 font-medium transition-[color,background-color,box-shadow,transform] duration-150",
                  !isLoading &&
                    "bg-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-hover)] hover:shadow-md active:translate-y-px disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                )}
                disabled={(!isLoading || showDelivery) && sendDisabled}
              >
                {showDelivery ? (
                  <>
                    <span>
                      {submitting
                        ? "Sending…"
                        : delivery === "queue"
                        ? "Queue"
                        : "Steer"}
                    </span>
                    {delivery === "queue" ? (
                      <ListPlus
                        size={16}
                        aria-hidden="true"
                      />
                    ) : (
                      <CornerDownLeft
                        size={16}
                        aria-hidden="true"
                      />
                    )}
                  </>
                ) : isLoading ? (
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
          </div>
        </form>
        <ReferenceFileDialog
          open={referenceDialogOpen}
          onOpenChange={setReferenceDialogOpen}
          files={files}
          sourceImageAttachments={sourceImageAttachments}
          onConfirm={addReferences}
        />
      </>
    );
  }
);

ChatComposer.displayName = "ChatComposer";
