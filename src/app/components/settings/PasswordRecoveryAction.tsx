"use client";

import { Button } from "@/components/ui/button";
import { apiRequestPasswordResetEmail } from "@/lib/auth";
import { useState } from "react";

interface PasswordRecoveryActionProps {
  accessToken: string;
  available: boolean;
}

export function PasswordRecoveryAction({
  accessToken,
  available,
}: PasswordRecoveryActionProps) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function sendLink() {
    setStatus("");
    setError("");
    setSending(true);
    try {
      await apiRequestPasswordResetEmail(accessToken);
      setStatus(
        "Check your verified email for a link that expires in 30 minutes."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not email a reset link."
      );
    } finally {
      setSending(false);
    }
  }

  if (!available) {
    return (
      <p className="text-muted-foreground text-sm">
        Contact an administrator for password recovery.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={sending}
        onClick={sendLink}
      >
        {sending ? "Sending…" : "Email me a reset link"}
      </Button>
      {status && (
        <p
          role="status"
          className="text-muted-foreground text-sm"
        >
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-destructive text-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
