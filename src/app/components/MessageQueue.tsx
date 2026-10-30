"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  ListOrdered,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
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
  onFocusComposer,
}: {
  queue: ReturnType<typeof useQueuedMessages>;
  onFocusComposer: () => void;
}) {
  const [text, setText] = useState("");
  const region = useRef<HTMLDivElement>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  if (!queue.items.length) return null;
  const dispatching = queue.items.some((entry) => entry.status === "sending");

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
      className="mb-2 gap-1 rounded-lg bg-transparent px-2 shadow-none [&_p]:mb-0"
    >
      <div className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        <ListOrdered
          className="size-3.5"
          aria-hidden="true"
        />
        <span
          role="status"
          aria-atomic="true"
        >
          {queue.items.length} queued{queue.paused ? " · Paused" : ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-1.5 px-2 text-xs transition-none"
          onClick={queue.paused ? queue.resume : queue.pause}
        >
          {queue.paused ? (
            <Play
              className="size-3.5"
              aria-hidden="true"
            />
          ) : (
            <Pause
              className="size-3.5"
              aria-hidden="true"
            />
          )}
          {queue.paused ? "Resume queue" : "Pause queue"}
        </Button>
      </div>
      <p
        className="px-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {queue.items.some((item) => item.status === "unknown")
          ? "Delivery needs checking. Automatic queue delivery is paused."
          : queue.items[0]?.status === "failed"
          ? "Message 1 wasn’t sent. Retry, edit, or delete it to continue."
          : queue.paused
          ? "Queue paused. Your messages are saved in this tab."
          : queue.editingId
          ? "Queue paused while you edit."
          : "Sent in order after the current response. Keep this chat open."}
      </p>
      <ol className="m-0 max-h-[min(13rem,20dvh)] list-none overflow-y-auto overscroll-contain p-0">
        {queue.items.map((item, index) => {
          const editing = queue.editingId === item.id;
          const sending = item.status === "sending";
          const uncertain = item.status === "unknown";
          const locked = sending || uncertain;
          const attachments = item.message.additional_kwargs?.attachments;
          return (
            <QueueItem
              key={item.id}
              className="px-2 py-2 transition-none"
              aria-busy={sending}
            >
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <span className="pt-1.5 text-xs tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1 basis-3/4 sm:basis-0">
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
                      Message was not sent. Retry when the response finishes, or
                      edit it.
                    </p>
                  )}
                  {uncertain && (
                    <p
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      Delivery is unconfirmed. Check delivery before sending
                      again. Dismissing this draft does not cancel a run.
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
                <QueueItemActions className="ml-auto shrink-0 gap-0">
                  {!uncertain && (
                    <QueueItemAction
                      className="h-8 gap-1 px-2 text-xs opacity-100 transition-none"
                      aria-label={`Steer with queued message ${index + 1}`}
                      disabled={
                        !queue.canSteer || dispatching || !!queue.editingId
                      }
                      title="Interrupt the response and send this message now; keep the rest queued"
                      onClick={() => {
                        queue.sendNow(item.id);
                        onFocusComposer();
                      }}
                    >
                      <CornerDownLeft
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      Steer
                    </QueueItemAction>
                  )}
                  {queue.items.length > 1 && (
                    <>
                      <QueueItemAction
                        className={actionClass}
                        aria-label={`Move queued message ${index + 1} up`}
                        disabled={
                          index === 0 || dispatching || !!queue.editingId
                        }
                        onClick={() => queue.move(item.id, -1)}
                      >
                        <ArrowUp
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      </QueueItemAction>
                      <QueueItemAction
                        className={actionClass}
                        aria-label={`Move queued message ${index + 1} down`}
                        disabled={
                          index === queue.items.length - 1 ||
                          dispatching ||
                          !!queue.editingId
                        }
                        onClick={() => queue.move(item.id, 1)}
                      >
                        <ArrowDown
                          className="size-3.5"
                          aria-hidden="true"
                        />
                      </QueueItemAction>
                    </>
                  )}
                  {(item.status === "failed" || uncertain) && (
                    <QueueItemAction
                      className={actionClass}
                      aria-label={
                        uncertain
                          ? `Check delivery of message ${index + 1}`
                          : `Retry queued message ${index + 1}`
                      }
                      title={
                        uncertain
                          ? "Check delivery without resending"
                          : "Retry message"
                      }
                      disabled={
                        editing ||
                        dispatching ||
                        (!uncertain && !queue.canRetry)
                      }
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
                    disabled={locked || (!!queue.editingId && !editing)}
                    onClick={(event) => {
                      if (editing) return;
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
                    aria-label={
                      uncertain
                        ? `Dismiss unconfirmed message ${index + 1}`
                        : `Delete queued message ${index + 1}`
                    }
                    disabled={sending}
                    onClick={() => {
                      queue.remove(item.id);
                      if (queue.items.length > 1) region.current?.focus();
                      else onFocusComposer();
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
