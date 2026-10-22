"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [pointerMotion, setPointerMotion] = useState(false);

  return (
    <button
      type="button"
      onClick={(event) => {
        setPointerMotion(event.detail > 0);
        toggleTheme();
      }}
      data-motion={pointerMotion ? "animate" : "instant"}
      aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
      title={isDark ? "Switch to day mode" : "Switch to night mode"}
      className={cn(
        "group/theme relative inline-flex h-9 w-16 items-center rounded-full border border-border bg-card px-1 shadow-sm",
        "hover:border-primary/40 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full",
          "transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-data-[motion=instant]/theme:transition-none motion-reduce:transition-none",
          isDark
            ? "translate-x-7 bg-[color:var(--color-primary)] text-white shadow-md"
            : "translate-x-0 bg-[color:var(--aptiv-orange)] text-white shadow-md"
        )}
      >
        {isDark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}
