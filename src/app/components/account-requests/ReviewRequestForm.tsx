"use client";

import { useId, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AccountRequestError,
  decideAccountRequest,
  requestDate,
  type AccountRequestDecision,
  type AdminAccountRequest,
  type AdminAccountRequestDetail,
} from "@/lib/account-requests";

export function ReviewRequestForm({
  detail,
  onChanged,
  onRefresh,
}: {
  detail: AdminAccountRequestDetail;
  onChanged: (row: AdminAccountRequest) => void;
  onRefresh: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(String(detail.requested_limit ?? ""));
  const [confirmedVersion, setConfirmedVersion] = useState<string>();
  const confirmed =
    confirmedVersion !== undefined &&
    confirmedVersion === detail.review_version;
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ payload: string; key: string }>(undefined);
  const { review, type } = detail;
  const deleting = type === "account_deletion";
  const increasing = type === "token_limit_increase";
  const limit = Number(amount);
  const minimum = (review?.token_limit ?? 0) + 1;
  const maximum = detail.requested_limit ?? 0;
  const unavailable = review?.unavailable_reason;
  const superseded = review?.closes_if_applied === true;
  const invalidLimit =
    increasing &&
    (!Number.isSafeInteger(limit) || limit < minimum || limit > maximum);

  async function decide() {
    let decision: AccountRequestDecision;
    if (declining) {
      decision = { action: "decline", reason: reason.trim() };
    } else if (deleting) {
      if (!confirmed) return;
      decision = {
        action: "fulfill",
        shared_ownership_confirmed: true,
        review_version: detail.review_version,
      };
    } else {
      decision = {
        action: "approve",
        review_version: detail.review_version,
        ...(increasing ? { approved_limit: limit } : {}),
      };
    }
    const payload = JSON.stringify(decision);
    if (attempt.current?.payload !== payload) {
      attempt.current = { payload, key: uuidv4() };
    }
    setBusy(true);
    setError("");
    try {
      onChanged(
        await decideAccountRequest(detail.id, decision, attempt.current.key)
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the decision."
      );
      if (err instanceof AccountRequestError && err.status === 409) {
        setConfirmedVersion(undefined);
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void decide();
      }}
    >
      {type === "usage_reset" && (
        <p className="text-sm">
          Reset the current weekly counters for weighted tokens
          {review?.used != null && ` (${review.used.toLocaleString()})`}, model
          calls
          {review?.calls_used != null &&
            ` (${review.calls_used.toLocaleString()})`}
          , and estimated model cost
          {review?.cost_used_micros != null &&
            ` (US$${(review.cost_used_micros / 1_000_000).toFixed(2)})`}
          .
        </p>
      )}
      {review?.cycle_end && (
        <p className="text-muted-foreground text-sm">
          Current cycle ends {requestDate(review.cycle_end)}.
        </p>
      )}
      {increasing && !declining && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>Approved token limit</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="numeric"
            step={1}
            min={minimum}
            max={maximum}
            value={amount}
            required
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Current limit {review?.token_limit?.toLocaleString() ?? "unlimited"}{" "}
            · Requested {maximum.toLocaleString()}
          </p>
          {review?.starts_cycle_on_approval && (
            <p className="text-muted-foreground text-xs">
              The first usage cycle starts at approval. The increase expires
              seven days later.
            </p>
          )}
        </div>
      )}
      {type === "developer_access" && (
        <div className="bg-muted/50 space-y-1 rounded-lg px-3 py-2 text-sm wrap-anywhere">
          <p>Grant the developer role to this account.</p>
          {!!review?.developer_capabilities?.length && (
            <ul className="list-inside list-disc">
              {review.developer_capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {deleting && !declining && (
        <div className="border-destructive/40 bg-destructive/5 space-y-2 rounded-lg border p-3">
          <p className="text-sm wrap-anywhere">
            Delete the app account for{" "}
            <strong>{detail.username ?? "this removed account"}</strong> and
            retire its saved credentials. Shared records stay with their owners.
          </p>
          <label className="min-h-touch flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              disabled={busy}
              onChange={(event) =>
                setConfirmedVersion(
                  event.target.checked ? detail.review_version : undefined
                )
              }
            />
            <span>
              I checked and handled any shared ownership for this account.
            </span>
          </label>
        </div>
      )}
      {declining && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-decline`}>Reason shown to the requester</Label>
          <Textarea
            id={`${id}-decline`}
            value={reason}
            required
            maxLength={500}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          {error}
        </p>
      )}
      {unavailable && (
        <p className="text-muted-foreground text-sm">{unavailable}</p>
      )}
      <DialogFooter>
        <Button
          variant="outline"
          type="button"
          disabled={busy}
          onClick={() => setDeclining(!declining)}
        >
          {declining ? "Back" : "Decline"}
        </Button>
        <Button
          type="submit"
          variant={deleting && !declining ? "destructive" : "default"}
          disabled={
            busy ||
            (declining
              ? !reason.trim()
              : (Boolean(unavailable) && !superseded) ||
                invalidLimit ||
                (deleting && !confirmed))
          }
        >
          {busy
            ? "Saving…"
            : declining
              ? "Confirm decline"
              : superseded
                ? "Close request"
                : deleting
                  ? "Delete account"
                  : "Approve and apply"}
        </Button>
      </DialogFooter>
    </form>
  );
}
