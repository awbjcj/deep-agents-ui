"use client";

import { AuthBrandPanel } from "@/app/components/auth/AuthBrandPanel";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { useEffect, useState, type ReactNode } from "react";

interface AuthShellProps {
  /** Document title prefix; React hoists the `<title>` into `<head>`. */
  title: string;
  children: ReactNode;
}

export function AuthShell({ title, children }: AuthShellProps) {
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <div className="flex min-h-dvh w-full bg-[var(--color-background)]">
      <title>{`${title} · VSDA Deep Agent`}</title>
      <AuthBrandPanel />

      <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col">
        <div
          className="auth-form-backdrop pointer-events-none absolute inset-0"
          aria-hidden="true"
        />

        <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10 sm:py-6">
          {/* Theme is resolved client-side, so swap logos with CSS to keep SSR output stable. */}
          <div className="lg:invisible">
            <img
              src="/assets/aptiv_logo_color.svg"
              alt="Aptiv"
              className="h-6 w-auto dark:hidden"
            />
            <img
              src="/assets/aptiv_logo_white.svg"
              alt="Aptiv"
              className="hidden h-6 w-auto dark:block"
            />
          </div>
          <ThemeToggle />
        </header>

        <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-8 sm:px-10">
          <div className="auth-entry w-full max-w-[420px]">{children}</div>
        </main>

        <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-tertiary sm:px-10">
          <span>
            {currentYear ? `© ${currentYear} Aptiv` : "© Aptiv"} · Confidential
          </span>
          <span className="uppercase tracking-[0.16em] lg:hidden">
            Precision. Innovation. Safety.
          </span>
        </footer>
      </div>
    </div>
  );
}
