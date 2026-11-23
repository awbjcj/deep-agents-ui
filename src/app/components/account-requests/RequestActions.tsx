"use client";

import { useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAccountRequestOptions,
  type AccountRequestType,
} from "@/lib/account-requests";
import { useAuth } from "@/providers/AuthProvider";
import { RequestForm } from "./RequestForm";
import { RequestHistory } from "./RequestHistory";

const actions = {
  usage_reset: {
    title: "Request a usage reset",
    description:
      "An admin can reset this week's weighted tokens, model calls, and estimated model cost.",
  },
  token_limit_increase: {
    title: "Request a higher token limit",
    description:
      "An admin can increase your weighted-token limit until the end of this usage cycle. Model-call and cost limits still apply.",
  },
  developer_access: {
    title: "Request developer access",
    description:
      "Tell the admin which tools or workflows you need for your work.",
  },
  account_deletion: {
    title: "Request account deletion",
    description:
      "Your account stays active until an admin deletes it. Account records and saved connection credentials covered by the app's deletion process are removed. Shared project records and content in connected services are retained.",
  },
};

export function RequestActions({
  location,
}: {
  location: "usage" | "account";
}) {
  const { user } = useAuth();
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
  const types: AccountRequestType[] =
    location === "usage"
      ? ["usage_reset", "token_limit_increase"]
      : ["developer_access", "account_deletion"];

  if (!userId) return null;

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
      <div
        ref={controls}
        className="space-y-2"
      >
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
        <div className="flex flex-wrap items-start gap-1.5">
          {types.map((type) => {
            const option = data?.find((item) => item.type === type);
            if (!option) return null;
            if (option.pending_request_id) {
              return (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    showHistory(option.pending_request_id!);
                  }}
                >
                  View pending{" "}
                  {type === "token_limit_increase"
                    ? "limit increase"
                    : type === "usage_reset"
                      ? "reset"
                      : type === "developer_access"
                        ? "access request"
                        : "deletion request"}
                </Button>
              );
            }
            if (!option.available) return null;
            return (
              <Button
                key={type}
                size="sm"
                variant="outline"
                type="button"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setPanel(type);
                }}
              >
                {actions[type].title}
              </Button>
            );
          })}
          {location === "account" && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={(event) => {
                trigger.current = event.currentTarget;
                showHistory();
              }}
            >
              My requests
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) setPanel(undefined);
        }}
      >
        <DialogContent
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
          <DialogHeader>
            <DialogTitle
              ref={historyHeading}
              tabIndex={-1}
            >
              {details?.title ?? "My requests"}
            </DialogTitle>
            <DialogDescription>
              {details?.description ??
                "Track your requests and withdraw ones awaiting review."}
            </DialogDescription>
          </DialogHeader>
          {panel === "history" && (
            <>
              {submitted && (
                <p
                  role="status"
                  className="text-sm font-medium"
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
                  <div className="space-y-1 text-sm">
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
