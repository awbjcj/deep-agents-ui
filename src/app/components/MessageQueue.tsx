"use client";

import { useRef, useState } from "react";
import { ListOrdered, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
} from "@/components/ai-elements/queue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { useQueuedMessages } from "@/app/hooks/useQueuedMessages";
import {
  editQueuedMessage,
  hasQueuedMessageContent,
  queuedMessageText,
} from "@/lib/queued-messages";

/** Review and edit pending user prompts before they enter the conversation. */
export function MessageQueue({
  queue,
}: {
  queue: ReturnType<typeof useQueuedMessages>;
}) {
  const [text, setText] = useState("");
  const region = useRef<HTMLDivElement>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  if (!queue.items.length) return null;

  const finishEditing = () => {
    editTrigger.current?.focus();
  };
  const actionClass =
    "size-8 shrink-0 opacity-100 transition-none active:scale-[0.97] motion-reduce:transform-none";

  return (
    <Queue
      ref={region}
      role="region"
      aria-label="Message queue"
      tabIndex={-1}
      className="mb-3 gap-1 rounded-lg bg-muted/20 px-2 shadow-none"
    >
      <div className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        <ListOrdered
          className="size-3.5"
          aria-hidden="true"
        />
        <span role="status">{queue.items.length} queued</span>
      </div>
      <p className="px-2 text-xs text-muted-foreground">
        {queue.editingId
          ? "Queue paused while you edit."
          : "Sent in order after the current response. Keep this chat open."}
      </p>
      <ol className="max-h-52 overflow-y-auto overscroll-contain">
        {queue.items.map((item, index) => {
          const editing = queue.editingId === item.id;
          const sending = item.status === "sending";
          const attachments = item.message.additional_kwargs?.attachments;
          return (
            <QueueItem
              key={item.id}
              className="px-2 py-2 transition-none"
              aria-busy={sending}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="pt-1.5 text-xs tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Textarea
                      autoFocus
                      aria-label="Edit queued message"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          queue.edit(null);
                          finishEditing();
                        }
                        if (
                          event.key === "Enter" &&
                          (event.metaKey || event.ctrlKey) &&
                          !event.nativeEvent.isComposing &&
                          hasQueuedMessageContent(
                            editQueuedMessage(item.message, text)
                          )
                        ) {
                          event.preventDefault();
                          queue.save(item.id, text);
                          finishEditing();
                        }
                      }}
                      className="min-h-20 resize-y bg-background text-sm"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words py-1 [overflow-wrap:anywhere]">
                      {queuedMessageText(item.message).trim() ||
                        "Attached files"}
                    </p>
                  )}
                  {Array.isArray(attachments) && attachments.length > 0 && (
                    <p className="break-words text-xs text-muted-foreground">
                      {attachments
                        .map((attachment) => attachment.name)
                        .join(", ")}
                    </p>
                  )}
                  {sending && (
                    <p
                      role="status"
                      className="text-xs text-muted-foreground"
                    >
                      Sending…
                    </p>
                  )}
                  {item.status === "failed" && (
                    <p
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      Could not confirm sending. Retry or delete this message.
                    </p>
                  )}
                  {editing && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="transition-none"
                        disabled={
                          !hasQueuedMessageContent(
                            editQueuedMessage(item.message, text)
                          )
                        }
                        onClick={() => {
                          queue.save(item.id, text);
                          finishEditing();
                        }}
                      >
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="transition-none"
                        onClick={() => {
                          queue.edit(null);
                          finishEditing();
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <QueueItemActions className="shrink-0 gap-0">
                  {item.status === "failed" && (
                    <QueueItemAction
                      className={actionClass}
                      aria-label={`Retry queued message ${index + 1}`}
                      disabled={editing}
                      onClick={() => queue.retry(item.id)}
                    >
                      <RotateCcw
                        className="size-3.5"
                        aria-hidden="true"
                      />
                    </QueueItemAction>
                  )}
                  <QueueItemAction
                    className={actionClass}
                    aria-label={`Edit queued message ${index + 1}`}
                    disabled={sending || (!!queue.editingId && !editing)}
                    onClick={(event) => {
                      editTrigger.current = event.currentTarget;
                      setText(queuedMessageText(item.message));
                      queue.edit(item.id);
                    }}
                  >
                    <Pencil
                      className="size-3.5"
                      aria-hidden="true"
                    />
                  </QueueItemAction>
                  <QueueItemAction
                    className={actionClass}
                    aria-label={`Delete queued message ${index + 1}`}
                    disabled={sending}
                    onClick={() => {
                      queue.remove(item.id);
                      if (queue.items.length > 1) region.current?.focus();
                      else
                        document
                          .querySelector<HTMLTextAreaElement>(
                            'textarea[aria-label="Message"]'
                          )
                          ?.focus();
                    }}
                  >
                    <Trash2
                      className="size-3.5"
                      aria-hidden="true"
                    />
                  </QueueItemAction>
                </QueueItemActions>
              </div>
            </QueueItem>
          );
        })}
      </ol>
    </Queue>
  );
}
