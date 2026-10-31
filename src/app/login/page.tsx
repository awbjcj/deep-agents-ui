"use client";

import {
  AuthAccount,
  AuthSubmitButton,
} from "@/app/components/auth/AuthActions";
import { AuthField, AuthStatus } from "@/app/components/auth/AuthField";
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
  type AuthFieldError,
  type AuthFieldName,
} from "@/lib/auth-validation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Mode = "login" | "register" | "verify";

const COPY: Record<Mode, { title: string; description: string }> = {
  login: {
    title: "Sign In",
    description:
      "Use your VSDA Deep Agent account. It is separate from your Aptiv NetID.",
  },
  register: {
    title: "Create an Account",
    description:
      "Register with your Aptiv email. You’ll choose your own username and password — no NetID needed.",
  },
  verify: { title: "Verify Your Email", description: "" },
};

export default function LoginPage() {
  const { login, registerInit, registerVerify } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  // Only crossfade after a user-initiated switch; first paint uses the shell entry.
  const [hasSwitchedMode, setHasSwitchedMode] = useState(false);
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
  const [fieldError, setFieldError] = useState<AuthFieldError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const headline = COPY[mode].title;
  const supportingCopy =
    mode === "verify"
      ? `Enter the 6-digit code sent to ${pendingEmail}. It expires in ${
          expiresInMinutes ?? 15
        } minutes.`
      : COPY[mode].description;

  const errorFor = (field: AuthFieldName) =>
    fieldError?.field === field ? fieldError.message : undefined;

  // Show the message beside the field and move focus there so it is announced.
  const showFieldError = (next: AuthFieldError) => {
    setFieldError(next);
    document.getElementById(next.field)?.focus();
  };

  const clearFieldError = (field: AuthFieldName) => {
    setFieldError((current) => (current?.field === field ? null : current));
  };

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
    if (mode === "verify") document.getElementById("verificationCode")?.focus();
  }, [mode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setHasSwitchedMode(true);
    setError("");
    setFieldError(null);
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
    setFieldError(null);

    if (mode === "login") {
      const loginError = validateLogin({ username, password });
      if (loginError) {
        showFieldError(loginError);
        return;
      }
      setIsSubmitting(true);
      try {
        await login(username.trim(), password);
        enterFreshAppAfterAuth();
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Sign-in failed. Check your username and password, then try again."
        );
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
        showFieldError(registrationError);
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
        setError(
          err instanceof Error
            ? err.message
            : "Registration failed. Check your details and try again."
        );
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const codeError = validateVerificationCode(verificationCode);
    if (codeError) {
      showFieldError(codeError);
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
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Check the code or go back to request a new one."
      );
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
          eyebrow={mode === "login" ? "VSDA Deep Agent" : "Create Account"}
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
          className="auth-form"
          noValidate
        >
          {mode !== "verify" && (
            <AuthField
              id="username"
              label="Username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearFieldError("username");
              }}
              error={errorFor("username")}
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
              placeholder="first.last@aptiv.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              error={errorFor("email")}
              autoComplete="email"
              spellCheck={false}
              disabled={isSubmitting}
            />
          )}

          {mode !== "verify" && (
            <AuthField
              id="password"
              type="password"
              label="Password"
              labelAction={
                mode === "login" ? (
                  <Link
                    href="/forgot-password"
                    className="auth-link auth-link--subtle"
                  >
                    Forgot password?
                  </Link>
                ) : undefined
              }
              hint={
                mode === "register"
                  ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                  : undefined
              }
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              error={errorFor("password")}
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
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError("confirmPassword");
              }}
              error={errorFor("confirmPassword")}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          )}

          {mode === "register" && requireInvitationCode && (
            <AuthField
              id="invitationCode"
              label="Invitation code"
              value={invitationCode}
              onChange={(e) => {
                setInvitationCode(e.target.value);
                clearFieldError("invitationCode");
              }}
              error={errorFor("invitationCode")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={isSubmitting}
            />
          )}

          {mode === "verify" && (
            <AuthField
              id="verificationCode"
              label="Verification code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value.replace(/\D/g, ""));
                clearFieldError("verificationCode");
              }}
              error={errorFor("verificationCode")}
              autoComplete="one-time-code"
              spellCheck={false}
              disabled={isSubmitting}
              inputClassName="auth-field__input--code"
            />
          )}

          <AuthStatus message={error} />

          <AuthSubmitButton
            isSubmitting={isSubmitting}
            pendingLabel={
              mode === "login"
                ? "Signing in…"
                : mode === "register"
                ? "Sending code…"
                : "Verifying…"
            }
          >
            {mode === "login"
              ? "Sign In"
              : mode === "register"
              ? "Send Verification Code"
              : "Verify & Create Account"}
          </AuthSubmitButton>
        </form>
      </div>

      {mode === "login" ? (
        <AuthAccount
          title="One account for VSDA tools"
          text="Your VSDA Deep Agent account also signs you in to LLM Wiki. Register here, then use the same username and password everywhere."
        >
          <button
            type="button"
            onClick={() => switchMode("register")}
            className="auth-link auth-link--strong"
          >
            Create an Account
            <ArrowRight
              className="auth-icon"
              aria-hidden="true"
            />
          </button>
        </AuthAccount>
      ) : mode === "register" ? (
        <AuthAccount>
          <span>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="auth-link auth-link--strong"
            >
              Sign In
            </button>
          </span>
        </AuthAccount>
      ) : (
        <AuthAccount>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className="auth-link auth-link--strong"
          >
            <ArrowLeft
              className="auth-icon"
              aria-hidden="true"
            />
            Back to Registration
          </button>
        </AuthAccount>
      )}
    </AuthShell>
  );
}
