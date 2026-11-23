"use client";

import {
  AuthAccount,
  AuthSubmitButton,
} from "@/app/components/auth/AuthActions";
import { AuthField, AuthStatus } from "@/app/components/auth/AuthField";
import { AuthHeading } from "@/app/components/auth/AuthHeading";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { apiConfirmPasswordReset, clearAuthUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-validation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const hasCapturedToken = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (hasCapturedToken.current) return;
    hasCapturedToken.current = true;
    const { hash, pathname } = window.location;
    const value = new URLSearchParams(hash.slice(1)).get("token") ?? "";
    if (hash) window.history.replaceState(window.history.state, "", pathname);
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      Array.from(password).length < MIN_PASSWORD_LENGTH ||
      new TextEncoder().encode(password).length > 72
    ) {
      setError("Use at least 8 characters and no more than 72 bytes.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords don’t match. Re-enter the same password.");
      return;
    }
    if (!token || submitting) return;

    setSubmitting(true);
    try {
      await apiConfirmPasswordReset(token, password);
      clearAuthUser();
      setToken("");
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not reset your password."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const title = done ? "Password updated" : "Choose a new password";

  return (
    <AuthShell title={title}>
      <AuthHeading title={title} />
      {done ? (
        <AuthStatus
          tone="info"
          message="Sign in with your new password."
        />
      ) : token ? (
        <form
          className="auth-form"
          onSubmit={submit}
          noValidate
        >
          <AuthField
            id="password"
            type="password"
            label="New password"
            hint="At least 8 characters."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            disabled={submitting}
          />
          <AuthField
            id="confirmPassword"
            type="password"
            label="Confirm new password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            disabled={submitting}
          />
          <AuthStatus message={error} />
          <AuthSubmitButton
            isSubmitting={submitting}
            pendingLabel="Updating…"
          >
            Update password
          </AuthSubmitButton>
        </form>
      ) : (
        token === "" && (
          <AuthStatus message="This reset link is missing or invalid." />
        )
      )}
      <AuthAccount>
        {!done && (
          <Link
            href="/forgot-password"
            className="auth-link auth-link--strong"
          >
            Request a new link
          </Link>
        )}
        <Link
          href="/login"
          className="auth-link auth-link--strong"
        >
          Back to sign in
        </Link>
      </AuthAccount>
    </AuthShell>
  );
}
