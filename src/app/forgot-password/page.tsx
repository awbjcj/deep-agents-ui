"use client";

import {
  AuthAccount,
  AuthSubmitButton,
} from "@/app/components/auth/AuthActions";
import { AuthField, AuthStatus } from "@/app/components/auth/AuthField";
import { AuthHeading } from "@/app/components/auth/AuthHeading";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { apiForgotPassword } from "@/lib/auth";
import {
  ALLOWED_EMAIL_ERROR_MESSAGE,
  isAllowedRegistrationEmail,
} from "@/lib/email";
import { ArrowLeft } from "lucide-react";
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

  const title = done ? "Check your email" : "Reset your password";

  return (
    <AuthShell title={title}>
      <AuthHeading title={title} />

      {done ? (
        <AuthStatus
          tone="info"
          message={
            <>
              If <strong>{email}</strong> is registered, you’ll receive a
              temporary password. Use it to sign in and change your password.
            </>
          }
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="auth-form"
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

          <AuthStatus message={error} />

          <AuthSubmitButton
            isSubmitting={isSubmitting}
            pendingLabel="Sending…"
          >
            Email temporary password
          </AuthSubmitButton>
        </form>
      )}

      <AuthAccount>
        <Link
          href="/login"
          className="auth-link auth-link--strong"
        >
          <ArrowLeft
            className="auth-icon"
            aria-hidden="true"
          />
          Back to sign in
        </Link>
      </AuthAccount>
    </AuthShell>
  );
}
