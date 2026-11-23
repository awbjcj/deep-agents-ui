"use client";

import { useId, useRef, useState } from "react";
import useSWR from "swr";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
  AccountRequestError,
  getAccountRequest,
  listAccountRequests,
  withdrawAccountRequest,
  type AccountRequest,
} from "@/lib/account-requests";
import { RequestRow } from "./RequestRow";

export function RequestHistory({
  userId,
  requestId,
  onChange,
}: {
  userId: string;
  requestId?: string;
  onChange: () => void;
}) {
  const { data, error, mutate } = useSWR(["my-account-requests", userId], () =>
    listAccountRequests()
  );
  const featured = useSWR(
    requestId ? ["account-request", requestId, userId] : null,
    ([, id]) => getAccountRequest(id)
  );
  const [older, setOlder] = useState<AccountRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");
  const [announce, setAnnounce] = useState("");
  const keys = useRef(new Map<string, string>());
  const heading = useId();
  const focus = useRef<HTMLDivElement>(null);
  const rows = new Map<string, AccountRequest>();
  if (featured.data) rows.set(featured.data.id, featured.data);
  for (const row of data?.items ?? []) rows.set(row.id, row);
  for (const row of older) {
    if (!rows.has(row.id)) rows.set(row.id, row);
  }

  function updateRow(row: AccountRequest) {
    setOlder((previous) =>
      previous.map((item) => (item.id === row.id ? row : item))
    );
    if (requestId === row.id) void featured.mutate(row, false);
    void mutate();
    onChange();
    focus.current?.focus();
  }

  async function withdraw(id: string) {
    setBusy(id);
    setMessage("");
    setAnnounce("");
    const key = keys.current.get(id) ?? uuidv4();
    keys.current.set(id, key);
    try {
      const row = await withdrawAccountRequest(id, key);
      keys.current.delete(id);
      updateRow(row);
      setAnnounce("Request withdrawn.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not withdraw the request."
      );
      if (err instanceof AccountRequestError && err.currentRequest?.id === id) {
        keys.current.delete(id);
        updateRow(err.currentRequest);
      } else {
        void mutate();
        if (requestId) void featured.mutate();
      }
    } finally {
      setBusy(undefined);
    }
  }

  const next = cursor === undefined ? data?.next_cursor : cursor;

  async function loadMore() {
    if (!next) return;
    setMessage("");
    setBusy("more");
    try {
      const page = await listAccountRequests(next);
      setOlder((previous) => [...previous, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not load older requests."
      );
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div
      ref={focus}
      tabIndex={-1}
      aria-labelledby={heading}
      className="space-y-2"
    >
      <span
        className="sr-only"
        id={heading}
      >
        Request history
      </span>
      {(error || featured.error) && (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          Could not load requests.{" "}
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              void mutate();
              void featured.mutate();
            }}
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
      {data && !rows.size && (
        <p className="border-border/80 text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          You haven’t made any requests yet.
        </p>
      )}
      {!!rows.size && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {[...rows.values()].map((row) => (
            <RequestRow
              row={row}
              key={row.id}
            >
              {row.status === "pending" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-touch"
                  disabled={!!busy}
                  onClick={() => void withdraw(row.id)}
                >
                  {busy === row.id ? "Withdrawing…" : "Withdraw"}
                </Button>
              )}
            </RequestRow>
          ))}
        </ul>
      )}
      {message && (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          {message}
        </p>
      )}
      <p
        role="status"
        className="sr-only"
      >
        {announce}
      </p>
      {next && (
        <Button
          variant="outline"
          size="sm"
          disabled={!!busy}
          onClick={() => void loadMore()}
        >
          {busy === "more" ? "Loading…" : "Load older requests"}
        </Button>
      )}
    </div>
  );
}
