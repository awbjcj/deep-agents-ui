"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
      title={isDark ? "Switch to day mode" : "Switch to night mode"}
      className={cn(
        "group relative inline-flex h-9 w-16 items-center rounded-full border border-border bg-card px-1 shadow-sm",
        "transition-colors duration-300 ease-in-out hover:border-primary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full",
          "transition-all duration-300 ease-in-out",
          isDark
            ? "left-[calc(100%-30px)] bg-[color:var(--color-primary)] text-white shadow-md"
            : "left-1 bg-[color:var(--aptiv-orange)] text-white shadow-md"
        )}
      >
        {isDark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}
