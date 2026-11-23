"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AccountRequestError,
  createAccountRequest,
  type AccountRequestOption,
  type CreateAccountRequest,
} from "@/lib/account-requests";

export function RequestForm({
  option,
  onSubmitted,
  onView,
}: {
  option: AccountRequestOption;
  onSubmitted: (id: string) => void;
  onView: (id: string) => void;
}) {
  const id = useId();
  const key = useRef<string>(undefined);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<string>();
  const { type } = option;
  const minimum = (option.current_limit ?? 0) + 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setDuplicate(undefined);
    let input: CreateAccountRequest;
    if (type === "account_deletion") {
      input = { type, current_password: password };
    } else if (!reason.trim()) {
      setError("Enter a reason for this request.");
      return;
    } else if (type === "token_limit_increase") {
      const requested_limit = Number(amount);
      if (!Number.isSafeInteger(requested_limit) || requested_limit < minimum) {
        setError("Enter a whole number above your current token limit.");
        return;
      }
      input = { type, requested_limit, reason: reason.trim() };
    } else {
      input = { type, reason: reason.trim() };
    }
    setBusy(true);
    key.current ??= uuidv4();
    try {
      const row = await createAccountRequest(input, key.current);
      onSubmitted(row.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not submit the request."
      );
      if (err instanceof AccountRequestError) setDuplicate(err.requestId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      {type === "token_limit_increase" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>Requested weekly token limit</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="numeric"
            min={minimum}
            step={1}
            required
            value={amount}
            disabled={busy}
            onChange={(event) => {
              key.current = undefined;
              setAmount(event.target.value);
            }}
          />
          <p className="text-muted-foreground text-xs">
            Current limit {option.current_limit?.toLocaleString()} weighted
            tokens
          </p>
        </div>
      )}
      {type === "account_deletion" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-password`}>Current password</Label>
          <Input
            id={`${id}-password`}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(event) => {
              key.current = undefined;
              setPassword(event.target.value);
            }}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-reason`}>Reason</Label>
          <Textarea
            id={`${id}-reason`}
            required
            value={reason}
            maxLength={500}
            disabled={busy}
            onChange={(event) => {
              key.current = undefined;
              setReason(event.target.value);
            }}
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
      {duplicate && (
        <Button
          type="button"
          variant="link"
          onClick={() => onView(duplicate)}
        >
          View existing request
        </Button>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant={type === "account_deletion" ? "destructive" : "default"}
          disabled={busy}
        >
          {busy ? "Submitting…" : "Submit request"}
        </Button>
      </DialogFooter>
    </form>
  );
}
