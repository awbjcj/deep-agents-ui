"use client";

import {
  AuthAltAction,
  AuthSubmitButton,
  authLinkClassName,
} from "@/app/components/auth/AuthActions";
import { AuthError, AuthField } from "@/app/components/auth/AuthField";
import { AuthHeading } from "@/app/components/auth/AuthHeading";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { apiForgotPassword } from "@/lib/auth";
import {
  ALLOWED_EMAIL_ERROR_MESSAGE,
  isAllowedRegistrationEmail,
} from "@/lib/email";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedRegistrationEmail(normalizedEmail)) {
      setError(ALLOWED_EMAIL_ERROR_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiForgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      setDone(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not send reset email"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const backLink = (
    <Link
      href="/login"
      className={authLinkClassName}
    >
      <ArrowLeft
        className="h-4 w-4"
        aria-hidden="true"
      />
      Back to sign in
    </Link>
  );

  return (
    <AuthShell title="Forgot password">
      <AuthHeading
        eyebrow="Account recovery"
        title="Forgot password"
        description={
          done
            ? "If your address is registered, a temporary password is on its way."
            : "Enter your Aptiv email to receive a temporary password."
        }
      />

      {done ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-brand-subtle bg-brand-tertiary px-4 py-3.5 text-sm text-primary"
        >
          <MailCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary"
            aria-hidden="true"
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Check <strong className="font-semibold">{email}</strong> for your
            temporary password, then sign in and change it.
          </span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
        >
          <AuthField
            id="email"
            type="email"
            label="Aptiv email"
            icon={Mail}
            placeholder="first.last@aptiv.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={isSubmitting}
          />

          <AuthError message={error} />

          <AuthSubmitButton
            isSubmitting={isSubmitting}
            pendingLabel="Sending..."
          >
            Email Temporary Password
          </AuthSubmitButton>
        </form>
      )}

      <AuthAltAction>{backLink}</AuthAltAction>
    </AuthShell>
  );
}
