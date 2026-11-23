"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAdminAccountRequest,
  listAdminAccountRequests,
  requestLabels,
  type AccountRequestType,
  type AdminAccountRequest,
} from "@/lib/account-requests";
import { useAuth } from "@/providers/AuthProvider";
import { RequestDialogHeader } from "./RequestDialogHeader";
import { RequestRow } from "./RequestRow";
import { ReviewRequestForm } from "./ReviewRequestForm";

export function AdminRequestInbox({
  onFulfilled,
}: {
  onFulfilled: () => void;
}) {
  const { user } = useAuth();
  const filtersId = useId();
  const [status, setStatus] = useState<"pending" | "history">("pending");
  const [type, setType] = useState<AccountRequestType>();
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<AdminAccountRequest>();
  const [success, setSuccess] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { data, error, mutate } = useSWR(
    user?.role === "admin"
      ? ["admin-account-requests", user.user_id, status, type, cursor]
      : null,
    () => listAdminAccountRequests(status, type, cursor)
  );
  const detail = useSWR(
    selected && user?.role === "admin"
      ? ["admin-account-request", user.user_id, selected.id]
      : null,
    () => getAdminAccountRequest(selected!.id)
  );

  function onChanged(row: AdminAccountRequest) {
    const message =
      row.status === "fulfilled"
        ? "Request completed."
        : row.status === "declined"
          ? "Request declined."
          : "Request closed.";
    if (row.status === "fulfilled") onFulfilled();
    setSuccess(message);
    setSelected(undefined);
    if (cursor && data?.items.length === 1) setCursor(undefined);
    void mutate();
  }

  return (
    <section
      aria-labelledby={`${filtersId}-heading`}
      className="settings-surface @container min-w-0 space-y-4 p-3 @sm/panel:p-4"
    >
      <header className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Inbox
            className="size-4"
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <h3
            ref={heading}
            tabIndex={-1}
            id={`${filtersId}-heading`}
            className="text-base font-semibold tracking-tight"
          >
            Requests
          </h3>
        </div>
      </header>
      <div className="border-border/70 grid gap-3 border-t pt-3 @xs:grid-cols-[minmax(0,9rem)_minmax(0,14rem)]">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${filtersId}-status`}>Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value === "history" ? "history" : "pending");
              setCursor(undefined);
            }}
          >
            <SelectTrigger
              id={`${filtersId}-status`}
              className="min-h-touch bg-background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="history">History</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${filtersId}-type`}>Request type</Label>
          <Select
            value={type ?? "all"}
            onValueChange={(value) => {
              setType(
                value === "all" ? undefined : (value as AccountRequestType)
              );
              setCursor(undefined);
            }}
          >
            <SelectTrigger
              id={`${filtersId}-type`}
              className="min-h-touch bg-background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(requestLabels).map(([value, label]) => (
                <SelectItem
                  key={value}
                  value={value}
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {success && (
        <p
          role="status"
          className="bg-primary/10 text-primary flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <CheckCircle2
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          Could not load requests.{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => void mutate()}
          >
            Try again
          </Button>
        </p>
      )}
      {!data && !error && (
        <p
          role="status"
          className="text-muted-foreground text-sm"
        >
          Loading requests…
        </p>
      )}
      {data?.items.length === 0 && (
        <p className="border-border/80 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          {status === "pending"
            ? "No pending requests."
            : "No requests in history."}
        </p>
      )}
      {!!data?.items.length && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {data.items.map((row) => (
            <RequestRow
              row={row}
              requester={row.username ?? "Removed account"}
              key={row.id}
            >
              <Button
                type="button"
                size="sm"
                variant={status === "pending" ? "default" : "outline"}
                className="min-h-touch"
                aria-label={`${status === "pending" ? "Review" : "View"} ${requestLabels[row.type]} for ${row.username ?? "removed account"}`}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setSuccess("");
                  setSelected(row);
                }}
              >
                {status === "pending" ? "Review" : "View"}
                <ArrowRight
                  className="size-4"
                  aria-hidden="true"
                />
              </Button>
            </RequestRow>
          ))}
        </ul>
      )}
      {(cursor || data?.next_cursor) && (
        <div className="flex gap-2">
          {cursor && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(undefined)}
            >
              First page
            </Button>
          )}
          {data?.next_cursor && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(data.next_cursor ?? undefined)}
            >
              Next page
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent
          className="grid-cols-[minmax(0,1fr)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.current?.isConnected) trigger.current.focus();
            else heading.current?.focus();
          }}
        >
          <RequestDialogHeader
            title={selected ? requestLabels[selected.type] : "Review request"}
            description={
              <>
                {detail.data?.username ??
                  selected?.username ??
                  "Removed account"}
                {detail.data?.role && ` · ${detail.data.role}`}
              </>
            }
          />
          {detail.error && (
            <p
              role="alert"
              className="text-destructive text-sm"
            >
              Could not load this request.{" "}
              <Button
                variant="link"
                size="sm"
                onClick={() => void detail.mutate()}
              >
                Try again
              </Button>
            </p>
          )}
          {!detail.data && !detail.error && (
            <p
              role="status"
              className="text-muted-foreground text-sm"
            >
              Loading review…
            </p>
          )}
          {detail.data && (
            <>
              <ul className="m-0 list-none p-0">
                <RequestRow row={detail.data} />
              </ul>
              {detail.data.status === "pending" && (
                <ReviewRequestForm
                  key={detail.data.id}
                  detail={detail.data}
                  onChanged={onChanged}
                  onRefresh={() => {
                    void detail.mutate();
                    void mutate();
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
