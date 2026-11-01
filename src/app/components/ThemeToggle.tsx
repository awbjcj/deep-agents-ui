"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { useState, useSyncExternalStore } from "react";

interface ThemeToggleProps {
  className?: string;
}

const noopSubscribe = () => () => {};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  // The server renders the light state; the pre-hydration script may already
  // have applied dark. Visuals follow the `.dark` class via CSS, and the label
  // waits for hydration so server and client markup match.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const isDark = hydrated && theme === "dark";
  const [pointerMotion, setPointerMotion] = useState(false);
  const label = isDark ? "Switch to day mode" : "Switch to night mode";

  return (
    <button
      type="button"
      onClick={(event) => {
        setPointerMotion(event.detail > 0);
        toggleTheme();
      }}
      data-motion={pointerMotion ? "animate" : "instant"}
      aria-label={label}
      title={label}
      className={cn(
        "group/theme relative inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted px-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-white/[0.07]",
        "transition-colors duration-150 hover:border-[hsl(var(--primary)/0.4)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card shadow-sm",
          "transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-data-[motion=instant]/theme:transition-none motion-reduce:transition-none",
          "translate-x-0 text-[color:var(--aptiv-orange)] [.dark_&]:translate-x-7 [.dark_&]:text-[color:var(--color-primary)]"
        )}
      >
        <Sun
          size={14}
          aria-hidden="true"
          className="[.dark_&]:hidden"
        />
        <Moon
          size={14}
          aria-hidden="true"
          className="hidden [.dark_&]:block"
        />
      </span>
    </button>
  );
}
