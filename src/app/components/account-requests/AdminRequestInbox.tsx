"use client";

import { useId, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  getAdminAccountRequest,
  listAdminAccountRequests,
  requestLabels,
  type AccountRequestType,
  type AdminAccountRequest,
} from "@/lib/account-requests";
import { useAuth } from "@/providers/AuthProvider";
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
      className="border-border space-y-3 rounded-lg border p-4"
    >
      <h3
        ref={heading}
        tabIndex={-1}
        id={`${filtersId}-heading`}
        className="text-sm font-semibold"
      >
        Requests
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${filtersId}-status`}>Status</Label>
          <select
            id={`${filtersId}-status`}
            className="border-input bg-background min-h-touch rounded-md border px-2 text-sm"
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value === "history" ? "history" : "pending"
              );
              setCursor(undefined);
            }}
          >
            <option value="pending">Pending</option>
            <option value="history">History</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${filtersId}-type`}>Request type</Label>
          <select
            id={`${filtersId}-type`}
            className="border-input bg-background min-h-touch rounded-md border px-2 text-sm"
            value={type ?? ""}
            onChange={(event) => {
              setType(
                (event.target.value || undefined) as
                  AccountRequestType | undefined
              );
              setCursor(undefined);
            }}
          >
            <option value="">All types</option>
            {Object.entries(requestLabels).map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {success && (
        <p
          role="status"
          className="text-sm"
        >
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
        <p className="text-muted-foreground text-sm">
          {status === "pending"
            ? "No pending requests."
            : "No requests in history."}
        </p>
      )}
      {!!data?.items.length && (
        <ul>
          {data.items.map((row) => (
            <RequestRow
              row={row}
              key={row.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground max-w-48 truncate text-xs">
                  {row.username ?? "Removed account"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`${status === "pending" ? "Review" : "View"} ${requestLabels[row.type]} for ${row.username ?? "removed account"}`}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setSuccess("");
                    setSelected(row);
                  }}
                >
                  {status === "pending" ? "Review" : "View"}
                </Button>
              </div>
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
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.current?.isConnected) trigger.current.focus();
            else heading.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {selected ? requestLabels[selected.type] : "Review request"}
            </DialogTitle>
            <DialogDescription>
              {detail.data?.username ?? selected?.username ?? "Removed account"}
              {detail.data?.role && ` · ${detail.data.role}`}
            </DialogDescription>
          </DialogHeader>
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
              <ul>
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
