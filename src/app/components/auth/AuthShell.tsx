"use client";

import { AuthShowcase } from "@/app/components/auth/AuthShowcase";
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
    <div className="auth-page flex min-h-dvh w-full bg-[var(--color-background)] text-primary lg:gap-3 lg:p-3">
      <title>{`${title} · VSDA Deep Agent`}</title>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-[calc(100dvh-1.5rem)]">
        <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10 sm:py-6">
          {/* Theme is resolved before hydration, so swap logos with CSS to keep SSR output stable. */}
          <span
            className="flex items-center"
            translate="no"
          >
            <img
              src="/assets/aptiv_logo_color.svg"
              alt="Aptiv"
              width={142}
              height={32}
              className="h-8 w-auto [.dark_&]:hidden"
            />
            <img
              src="/assets/aptiv_logo_white.svg"
              alt="Aptiv"
              width={142}
              height={32}
              className="hidden h-8 w-auto [.dark_&]:block"
            />
          </span>
          <ThemeToggle />
        </header>

        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10"
        >
          <div className="auth-entry w-full max-w-[380px]">{children}</div>
        </main>

        <footer className="px-6 py-5 text-xs text-tertiary sm:px-10">
          <span translate="no">
            {currentYear ? `© ${currentYear} Aptiv` : "© Aptiv"}
          </span>{" "}
          · Confidential, for authorized Aptiv users
        </footer>
      </div>

      <AuthShowcase />
    </div>
  );
}
