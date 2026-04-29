"use client";

import { ThemeToggle } from "@/app/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "login" | "register" | "verify";

const APTIV_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@aptiv\.com$/i;

export default function LoginPage() {
  const router = useRouter();
  const { login, registerInit, registerVerify } = useAuth();
  const { theme } = useTheme();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingRegistrationId, setPendingRegistrationId] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  const headline =
    mode === "register"
      ? "Register"
      : mode === "verify"
        ? "Verify email"
        : "Sign in";
  const supportingCopy =
    mode === "register"
      ? "Use your Aptiv email to request access."
      : mode === "verify"
        ? `Enter the 6-digit code sent to ${pendingEmail}. It expires in ${
            expiresInMinutes ?? 15
          } minutes.`
        : "Use your Aptiv credentials to continue.";

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setVerificationCode("");
    if (next === "login") {
      setEmail("");
      setConfirmPassword("");
      setPendingRegistrationId("");
      setPendingEmail("");
      setExpiresInMinutes(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "login") {
      if (!username.trim() || !password.trim()) {
        setError("Username and password are required");
        return;
      }
      setIsSubmitting(true);
      try {
        await login(username.trim(), password);
        router.push("/");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "register") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!username.trim() || !normalizedEmail || !password.trim()) {
        setError("Username, Aptiv email, and password are required");
        return;
      }
      if (!APTIV_EMAIL_RE.test(normalizedEmail)) {
        setError("Email must be a valid @aptiv.com address");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      setIsSubmitting(true);
      try {
        const result = await registerInit({
          username: username.trim(),
          email: normalizedEmail,
          password,
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

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setIsSubmitting(true);
    try {
      await registerVerify({
        pending_registration_id: pendingRegistrationId,
        verification_code: verificationCode.trim(),
      });
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: "var(--color-background)" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.55,
        }}
      />

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-8 py-6">
        <img
          src={
            theme === "dark"
              ? "/assets/aptiv_logo_white.svg"
              : "/assets/aptiv_logo_color.svg"
          }
          alt="Aptiv"
          className="h-6 w-auto"
        />
        <ThemeToggle />
      </div>

      <div
        className="relative z-10 w-full max-w-[440px] rounded-lg border p-10"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
          boxShadow:
            "0 0 0 1px color-mix(in srgb, var(--color-primary) 10%, transparent), 0 28px 64px rgba(0, 0, 0, 0.14)",
        }}
      >
        <div className="mb-8">
          <div className="mb-5 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--aptiv-orange)" }}
            />
            <span
              className="text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "var(--color-text-primary)" }}
            >
              Aptiv
            </span>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--aptiv-orange)" }}
            />
          </div>
          <p
            className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--aptiv-orange)" }}
          >
            Vehicle System Data Analytics
          </p>
          <h1
            className="text-[32px] font-bold leading-[1.05] tracking-normal"
            style={{
              fontFamily: "var(--font-family-heading)",
              color: "var(--color-text-primary)",
              letterSpacing: "0",
            }}
          >
            VSDA Deep Agent
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {mode === "login" && "Sign in to your account."}
            {mode === "register" && "Create your account with your Aptiv email."}
            {mode === "verify" &&
              `Enter the 6-digit code sent to ${pendingEmail}. It expires in ${
                expiresInMinutes ?? 15
              } minutes.`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== "verify" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={isSubmitting}
              />
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Aptiv email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="first.last@aptiv.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
              />
            </div>
          )}

          {mode !== "verify" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                disabled={isSubmitting}
              />
            </div>
          )}

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {mode === "verify" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="verificationCode"
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Verification code
              </Label>
              <Input
                id="verificationCode"
                type="text"
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
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="mt-2 h-11 w-full rounded-lg text-sm font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "login" && "Signing in..."}
                {mode === "register" && "Sending code..."}
                {mode === "verify" && "Verifying..."}
              </>
            ) : mode === "login" ? (
              "Sign in"
            ) : mode === "register" ? (
              "Send Verification Code"
            ) : (
              "Verify and Create Account"
            )}
          </Button>
        </form>

        {mode === "login" && (
          <div className="mt-3 text-center text-sm">
            <Link
              href="/forgot-password"
              className="font-medium transition-opacity hover:opacity-75"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Forgot password?
            </Link>
          </div>
        )}

        <div className="mt-6 text-center text-sm">
          {mode === "verify" ? (
            <button
              type="button"
              onClick={() => switchMode("register")}
              className="font-semibold transition-opacity hover:opacity-75"
              style={{ color: "var(--color-primary)" }}
            >
              Back to registration
            </button>
          ) : (
            <>
              <span style={{ color: "var(--color-text-secondary)" }}>
                {mode === "register"
                  ? "Already have an account? "
                  : "Don't have an account? "}
              </span>
              <button
                type="button"
                onClick={() => switchMode(mode === "register" ? "login" : "register")}
                className="font-semibold transition-opacity hover:opacity-75"
                style={{ color: "var(--color-primary)" }}
              >
                {mode === "register" ? "Sign in" : "Register"}
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-8 py-5 text-[11px] uppercase tracking-[0.16em]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <span>Precision. Innovation. Safety.</span>
        <span>
          {currentYear
            ? `${currentYear} Aptiv - Confidential`
            : "Aptiv - Confidential"}
        </span>
      </div>
    </div>
  );
}
