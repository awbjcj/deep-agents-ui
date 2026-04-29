"use client";

import { ThemeToggle } from "@/app/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiForgotPassword } from "@/lib/auth";
import { useTheme } from "@/providers/ThemeProvider";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const APTIV_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@aptiv\.com$/i;

export default function ForgotPasswordPage() {
  const { theme } = useTheme();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!APTIV_EMAIL_RE.test(normalizedEmail)) {
      setError("Email must be a valid @aptiv.com address");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiForgotPassword(normalizedEmail);
      setEmail(normalizedEmail);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
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
          boxShadow: "0 28px 64px rgba(0, 0, 0, 0.14)",
        }}
      >
        <div className="mb-8">
          <h1
            className="text-[28px] font-bold leading-[1.1] tracking-normal"
            style={{
              fontFamily: "var(--font-family-heading)",
              color: "var(--color-text-primary)",
              letterSpacing: "0",
            }}
          >
            Forgot password
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {done
              ? "If your address is registered, a temporary password is on its way."
              : "Enter your Aptiv email to receive a temporary password."}
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: "var(--color-border)" }}
            >
              <MailCheck className="h-5 w-5" />
              <span>Check {email}</span>
            </div>
            <Link
              href="/login"
              className="block text-center text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && (
              <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-lg text-sm font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Email Temporary Password"
              )}
            </Button>

            <div className="text-center text-sm">
              <Link
                href="/login"
                className="font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
