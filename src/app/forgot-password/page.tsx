"use client";

import {
  AuthAltAction,
  AuthSubmitButton,
} from "@/app/components/auth/AuthActions";
import { AuthError, AuthField } from "@/app/components/auth/AuthField";
import { AuthHeading } from "@/app/components/auth/AuthHeading";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { authLinkClassName } from "@/app/components/auth/authStyles";
import { apiForgotPassword } from "@/lib/auth";
import {
  ALLOWED_EMAIL_ERROR_MESSAGE,
  isAllowedRegistrationEmail,
} from "@/lib/email";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedRegistrationEmail(normalizedEmail)) {
      setEmailError(
        normalizedEmail
          ? ALLOWED_EMAIL_ERROR_MESSAGE
          : "Enter your Aptiv email address."
      );
      document.getElementById("email")?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await apiForgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      setDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn’t send the reset email. Try again in a moment."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Reset Your Password">
      <AuthHeading
        title="Reset Your Password"
        description={
          done
            ? "If the address is registered, a temporary password is on its way."
            : "Enter your Aptiv email to receive a temporary password."
        }
      />

      {done ? (
        <div
          role="status"
          className="auth-error flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 text-sm text-primary"
        >
          <MailCheck
            className="mt-0.5 h-5 w-5 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Check <strong className="font-bold">{email}</strong> for your
            temporary password, then sign in and change it.
          </span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          noValidate
        >
          <AuthField
            id="email"
            type="email"
            label="Aptiv email"
            placeholder="first.last@aptiv.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError("");
            }}
            error={emailError || undefined}
            autoComplete="email"
            spellCheck={false}
            disabled={isSubmitting}
          />

          <AuthError message={error} />

          <AuthSubmitButton
            isSubmitting={isSubmitting}
            pendingLabel="Sending…"
          >
            Email Temporary Password
          </AuthSubmitButton>
        </form>
      )}

      <AuthAltAction>
        <Link
          href="/login"
          className={authLinkClassName}
        >
          <ArrowLeft
            className="h-4 w-4"
            aria-hidden="true"
          />
          Back to Sign In
        </Link>
      </AuthAltAction>
    </AuthShell>
  );
}
