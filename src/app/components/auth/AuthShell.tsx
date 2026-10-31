"use client";

import { AuthBrandPanel } from "@/app/components/auth/AuthBrandPanel";
import { AuthThemeToggle } from "@/app/components/auth/AuthThemeToggle";
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
    <div className="auth-shell">
      <title>{`${title} · VSDA Deep Agent`}</title>
      <AuthBrandPanel />

      <div className="auth-panel">
        <div className="auth-panel__top">
          <span
            className="auth-panel__logos"
            translate="no"
          >
            <img
              className="auth-logo auth-logo--light h-[22px]"
              src="/assets/aptiv_logo_color.svg"
              alt="Aptiv"
              width={98}
              height={22}
            />
            <img
              className="auth-logo auth-logo--dark h-[22px]"
              src="/assets/aptiv_logo_white.svg"
              alt="Aptiv"
              width={98}
              height={22}
            />
          </span>
          <AuthThemeToggle />
        </div>

        <main
          id="main-content"
          className="auth-panel__content"
        >
          <section className="auth-card">{children}</section>
        </main>

        <footer className="auth-panel__footer">
          <span className="auth-panel__tagline">
            Precision. Innovation. Safety.
          </span>
          <span className="auth-panel__copyright">
            © {currentYear ? `${currentYear} ` : ""}Aptiv · Confidential
          </span>
        </footer>
      </div>
    </div>
  );
}
