"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const { theme } = useTheme();

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (isRegister && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: "var(--color-background)" }}
    >
      {/* Dot-grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.55,
        }}
      />

      {/* Ambient primary glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[620px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--color-primary) 0%, transparent 65%)",
          opacity: theme === "dark" ? 0.14 : 0.07,
        }}
      />

      {/* Ambient orange accent */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-[360px] w-[360px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--aptiv-orange) 0%, transparent 70%)",
          opacity: theme === "dark" ? 0.08 : 0.04,
        }}
      />

      {/* Top bar with Aptiv logo + theme toggle */}
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

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[440px] rounded-2xl border p-10"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
          boxShadow:
            "0 0 0 1px color-mix(in srgb, var(--color-primary) 10%, transparent), 0 28px 64px rgba(0, 0, 0, 0.14)",
          animation: "loginEntry 500ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        {/* Brand header */}
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
            className="text-[32px] font-bold leading-[1.05] tracking-tight"
            style={{
              fontFamily: "var(--font-family-heading)",
              color: "var(--color-text-primary)",
              letterSpacing: "-0.035em",
            }}
          >
            VSDA Deep Agent
          </h1>
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {isRegister
              ? "Create your account to get started."
              : "Sign in to your account."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
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
              autoComplete={isRegister ? "new-password" : "current-password"}
              disabled={isSubmitting}
            />
          </div>

          {isRegister && (
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
                {isRegister ? "Creating account…" : "Signing in…"}
              </>
            ) : isRegister ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span style={{ color: "var(--color-text-secondary)" }}>
            {isRegister
              ? "Already have an account? "
              : "Don't have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
              setConfirmPassword("");
            }}
            className="font-semibold transition-opacity hover:opacity-75"
            style={{ color: "var(--color-primary)" }}
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-8 py-5 text-[11px] uppercase tracking-[0.16em]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <span>Precision. Innovation. Safety.</span>
        <span>{currentYear ? `© ${currentYear} Aptiv — Confidential` : "© Aptiv — Confidential"}</span>
      </div>
    </div>
  );
}
