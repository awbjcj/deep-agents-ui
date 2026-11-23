"use client";

import { useId, useRef, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  History,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  getAccountRequestOptions,
  type AccountRequestType,
} from "@/lib/account-requests";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { RequestDialogHeader } from "./RequestDialogHeader";
import { RequestForm } from "./RequestForm";
import { RequestHistory } from "./RequestHistory";

const actions = {
  usage_reset: {
    icon: RotateCcw,
    pending: "View pending reset",
    title: "Request a usage reset",
    description:
      "An admin can reset this week's weighted tokens, model calls, and estimated model cost.",
  },
  token_limit_increase: {
    icon: TrendingUp,
    pending: "View pending limit increase",
    title: "Request a higher token limit",
    description:
      "An admin can increase your weighted-token limit until the end of this usage cycle. Model-call and cost limits still apply.",
  },
  developer_access: {
    icon: ShieldCheck,
    pending: "View pending access request",
    title: "Request developer access",
    description:
      "Tell the admin which tools or workflows you need for your work.",
  },
  account_deletion: {
    icon: Trash2,
    pending: "View pending deletion request",
    title: "Request account deletion",
    description:
      "Your account stays active until an admin deletes it. Account records and saved connection credentials covered by the app's deletion process are removed. Shared project records and content in connected services are retained.",
  },
};

const usageTypes: AccountRequestType[] = [
  "usage_reset",
  "token_limit_increase",
];
const accountTypes: AccountRequestType[] = [
  "developer_access",
  "account_deletion",
  ...usageTypes,
];

export function RequestActions({
  location,
}: {
  location: "usage" | "account";
}) {
  const { user } = useAuth();
  const headingId = useId();
  const userId = user?.user_id;
  const { data, error, mutate } = useSWR(
    userId ? ["account-request-options", userId] : null,
    getAccountRequestOptions
  );
  const { mutate: mutateCache } = useSWRConfig();
  const [panel, setPanel] = useState<AccountRequestType | "history">();
  const [requestId, setRequestId] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const active = data?.find((item) => item.type === panel);
  const details = panel && panel !== "history" ? actions[panel] : undefined;
  const isAccount = location === "account";
  const types = isAccount ? accountTypes : usageTypes;
  const options = types.flatMap((type) => {
    const option = data?.find((item) => item.type === type);
    return option && (option.available || option.pending_request_id)
      ? [option]
      : [];
  });

  if (!userId) return null;

  const actionClassName =
    "h-auto min-h-touch w-full min-w-0 justify-start gap-2 px-2.5 py-2 text-left leading-snug whitespace-normal";

  function showHistory(id?: string, wasSubmitted = false) {
    setRequestId(id);
    setSubmitted(wasSubmitted);
    setPanel("history");
    if (wasSubmitted) {
      void mutate();
      void mutateCache(["my-account-requests", userId]);
    }
    requestAnimationFrame(() => historyHeading.current?.focus());
  }

  return (
    <>
      <section
        aria-labelledby={headingId}
        hidden={!isAccount && !options.length && !error}
        className={cn(
          "min-w-0 space-y-3",
          isAccount ? "settings-surface p-3" : "border-border/70 border-t pt-3"
        )}
      >
        <h3
          id={headingId}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ClipboardList
            className="text-primary size-4 shrink-0"
            aria-hidden="true"
          />
          {isAccount ? "Account requests" : "Usage requests"}
        </h3>
        {error && (
          <p
            role="alert"
            className="text-muted-foreground text-xs"
          >
            Could not load request options.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void mutate()}
            >
              Try again
            </button>
          </p>
        )}
        <div
          ref={controls}
          className="grid gap-1.5"
        >
          {options.map(({ type, pending_request_id: pendingId }) => {
            const action = actions[type];
            const Icon = pendingId ? History : action.icon;
            return (
              <Button
                key={type}
                size="sm"
                variant="outline"
                type="button"
                className={actionClassName}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  if (pendingId) showHistory(pendingId);
                  else setPanel(type);
                }}
              >
                <Icon
                  className="text-primary size-4"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 wrap-anywhere">
                  {pendingId ? action.pending : action.title}
                </span>
                <ChevronRight
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              </Button>
            );
          })}
          {isAccount && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              className={actionClassName}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                showHistory();
              }}
            >
              <History
                className="text-primary size-4"
                aria-hidden="true"
              />
              <span className="flex-1">My requests</span>
              <ChevronRight
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            </Button>
          )}
        </div>
      </section>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(undefined);
        }}
      >
        <DialogContent
          className="grid-cols-[minmax(0,1fr)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.current?.isConnected) {
              trigger.current.focus();
            } else {
              controls.current
                ?.querySelector<HTMLButtonElement>("button:enabled")
                ?.focus();
            }
          }}
        >
          <RequestDialogHeader
            title={details?.title ?? "My requests"}
            titleRef={historyHeading}
            description={
              details?.description ??
              "Track your requests and withdraw ones awaiting review."
            }
          />
          {panel === "history" && (
            <>
              {submitted && (
                <p
                  role="status"
                  className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  Request sent to the admins.
                </p>
              )}
              <RequestHistory
                key={requestId ?? "all"}
                userId={userId}
                requestId={requestId}
                onChange={() => {
                  void mutate();
                }}
              />
            </>
          )}
          {active && panel !== "history" && (
            <>
              {active.type === "developer_access" &&
                !!active.developer_capabilities?.length && (
                  <div className="bg-muted/50 space-y-1 rounded-lg px-3 py-2 text-sm wrap-anywhere">
                    <p className="font-medium">Additional developer access</p>
                    <ul className="list-inside list-disc">
                      {active.developer_capabilities.map((capability) => (
                        <li key={capability}>{capability}</li>
                      ))}
                    </ul>
                  </div>
                )}
              <RequestForm
                key={active.type}
                option={active}
                onSubmitted={(id) => showHistory(id, true)}
                onView={(id) => showHistory(id)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
