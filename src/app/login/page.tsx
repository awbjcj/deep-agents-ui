"use client";

import {
  AuthAltAction,
  AuthSubmitButton,
  authLinkClassName,
} from "@/app/components/auth/AuthActions";
import { AuthError, AuthField } from "@/app/components/auth/AuthField";
import { AuthHeading } from "@/app/components/auth/AuthHeading";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { useAuth } from "@/providers/AuthProvider";
import { apiGetRegistrationPolicy } from "@/lib/auth";
import { enterFreshAppAfterAuth } from "@/app/utils/navigationRecovery";
import {
  MIN_PASSWORD_LENGTH,
  validateLogin,
  validateRegistration,
  validateVerificationCode,
} from "@/lib/auth-validation";
import {
  ArrowLeft,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Ticket,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Mode = "login" | "register" | "verify";

export default function LoginPage() {
  const { login, registerInit, registerVerify } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  // Only crossfade after a user-initiated switch; first paint uses the shell entry.
  const [hasSwitchedMode, setHasSwitchedMode] = useState(false);
  const verificationInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [requireInvitationCode, setRequireInvitationCode] = useState(false);
  const [pendingRegistrationId, setPendingRegistrationId] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headline =
    mode === "register"
      ? "Register"
      : mode === "verify"
      ? "Verify email"
      : "Sign in";
  const supportingCopy =
    mode === "register"
      ? "Register a new account with your Aptiv email. No Aptiv network login (NetID) required — you'll set your own username and password."
      : mode === "verify"
      ? `Enter the 6-digit code sent to ${pendingEmail}. It expires in ${
          expiresInMinutes ?? 15
        } minutes.`
      : "Sign in with the VSDA Deep Agent account you registered — not your Aptiv NetID.";

  useEffect(() => {
    let active = true;
    apiGetRegistrationPolicy()
      .then((policy) => {
        if (active) setRequireInvitationCode(policy.require_invitation_code);
      })
      .catch(() => {
        // Non-fatal: fall back to no invitation requirement in the UI. The
        // backend still enforces the real policy on submit.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode === "verify") verificationInputRef.current?.focus();
  }, [mode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setHasSwitchedMode(true);
    setError("");
    setVerificationCode("");
    if (next === "login") {
      setEmail("");
      setConfirmPassword("");
      setInvitationCode("");
      setPendingRegistrationId("");
      setPendingEmail("");
      setExpiresInMinutes(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "login") {
      const loginError = validateLogin({ username, password });
      if (loginError) {
        setError(loginError);
        return;
      }
      setIsSubmitting(true);
      try {
        await login(username.trim(), password);
        enterFreshAppAfterAuth();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "register") {
      const normalizedEmail = email.trim().toLowerCase();
      const registrationError = validateRegistration({
        username,
        normalizedEmail,
        password,
        confirmPassword,
        invitationCode,
        requireInvitationCode,
      });
      if (registrationError) {
        setError(registrationError);
        return;
      }
      setIsSubmitting(true);
      try {
        const result = await registerInit({
          username: username.trim(),
          email: normalizedEmail,
          password,
          invitation_code: requireInvitationCode
            ? invitationCode.trim()
            : undefined,
        });
        setPendingRegistrationId(result.pending_registration_id);
        setPendingEmail(result.email);
        setExpiresInMinutes(result.expires_in_minutes);
        switchMode("verify");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const codeError = validateVerificationCode(verificationCode);
    if (codeError) {
      setError(codeError);
      return;
    }
    setIsSubmitting(true);
    try {
      await registerVerify({
        pending_registration_id: pendingRegistrationId,
        verification_code: verificationCode.trim(),
      });
      enterFreshAppAfterAuth();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title={headline}>
      <div
        key={mode}
        className={hasSwitchedMode ? "auth-swap" : undefined}
      >
        <AuthHeading
          eyebrow={mode === "login" ? "VSDA Deep Agent" : "Create account"}
          title={headline}
          description={supportingCopy}
          step={
            mode === "register"
              ? { current: 1, total: 2 }
              : mode === "verify"
              ? { current: 2, total: 2 }
              : undefined
          }
        />

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
        >
          {mode !== "verify" && (
            <AuthField
              id="username"
              label="Username"
              icon={UserRound}
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isSubmitting}
            />
          )}

          {mode === "register" && (
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
          )}

          {mode !== "verify" && (
            <AuthField
              id="password"
              type="password"
              label="Password"
              icon={LockKeyhole}
              placeholder={
                mode === "register"
                  ? `At least ${MIN_PASSWORD_LENGTH} characters`
                  : "Enter your password"
              }
              hint={
                mode === "register"
                  ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
                  : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              disabled={isSubmitting}
            />
          )}

          {mode === "register" && (
            <AuthField
              id="confirmPassword"
              type="password"
              label="Confirm Password"
              icon={LockKeyhole}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          )}

          {mode === "register" && requireInvitationCode && (
            <AuthField
              id="invitationCode"
              label="Invitation code"
              icon={Ticket}
              placeholder="Enter your invitation code"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              autoComplete="off"
              disabled={isSubmitting}
            />
          )}

          {mode === "verify" && (
            <AuthField
              id="verificationCode"
              label="Verification code"
              icon={ShieldCheck}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={verificationCode}
              onChange={(e) =>
                setVerificationCode(e.target.value.replace(/\D/g, ""))
              }
              autoComplete="one-time-code"
              disabled={isSubmitting}
              ref={verificationInputRef}
              inputClassName="h-12 font-mono text-lg tracking-[0.4em] tabular-nums md:text-lg md:tracking-[0.4em]"
            />
          )}

          {mode === "login" && (
            <div className="-mt-1 flex justify-end">
              <Link
                href="/forgot-password"
                className="rounded-sm text-xs font-medium text-secondary transition-colors duration-150 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <AuthError message={error} />

          <AuthSubmitButton
            isSubmitting={isSubmitting}
            pendingLabel={
              mode === "login"
                ? "Signing in..."
                : mode === "register"
                ? "Sending code..."
                : "Verifying..."
            }
          >
            {mode === "login"
              ? "Sign in"
              : mode === "register"
              ? "Send Verification Code"
              : "Verify and Create Account"}
          </AuthSubmitButton>
        </form>
      </div>

      <AuthAltAction>
        {mode === "verify" ? (
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={authLinkClassName}
          >
            <ArrowLeft
              className="h-4 w-4"
              aria-hidden="true"
            />
            Back to registration
          </button>
        ) : (
          <>
            <span className="text-secondary">
              {mode === "register"
                ? "Already have an account? "
                : "Don't have an account? "}
            </span>
            <button
              type="button"
              onClick={() =>
                switchMode(mode === "register" ? "login" : "register")
              }
              className={authLinkClassName}
            >
              {mode === "register" ? "Sign in" : "Register"}
            </button>
          </>
        )}
      </AuthAltAction>
    </AuthShell>
  );
}
