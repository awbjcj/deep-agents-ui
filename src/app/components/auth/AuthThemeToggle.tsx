"use client";

import { useTheme } from "@/providers/ThemeProvider";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Square icon theme switch from the shared VSDA sign-in design. */
export function AuthThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  // Icons follow the `.dark` class in CSS; the label waits for hydration so
  // server and client markup match when the pre-paint script applied dark.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const label =
    hydrated && theme === "dark"
      ? "Switch to light theme"
      : "Switch to dark theme";

  return (
    <button
      type="button"
      className="auth-theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <Moon
        className="auth-icon auth-icon--moon"
        aria-hidden="true"
      />
      <Sun
        className="auth-icon auth-icon--sun"
        aria-hidden="true"
      />
    </button>
  );
}
