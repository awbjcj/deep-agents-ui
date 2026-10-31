"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type KeyboardEvent } from "react";

interface AuthFieldProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  inputClassName?: string;
}

export function AuthField({
  id,
  label,
  icon: Icon,
  hint,
  type = "text",
  inputClassName,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...inputProps
}: AuthFieldProps) {
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isPassword && typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  const hintId = `${id}-hint`;
  const capsId = `${id}-caps`;
  const describedBy =
    [hint ? hintId : null, capsLock ? capsId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-medium text-primary"
      >
        {label}
      </Label>
      <div className="group/field relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary transition-colors duration-150 group-focus-within/field:text-brand-primary"
          aria-hidden="true"
        />
        <Input
          id={id}
          type={isPassword && revealed ? "text" : type}
          aria-describedby={describedBy}
          className={cn(
            "h-11 bg-[var(--color-surface)] pl-10 text-sm dark:bg-[var(--color-surface)]",
            isPassword && "pr-11",
            inputClassName
          )}
          onKeyDown={(event) => {
            trackCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            trackCapsLock(event);
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            aria-controls={id}
            disabled={inputProps.disabled}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-tertiary transition-colors duration-150 hover:bg-tertiary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revealed ? (
              <EyeOff
                key="hide"
                className="auth-icon-swap h-4 w-4"
                aria-hidden="true"
              />
            ) : (
              <Eye
                key="show"
                className="auth-icon-swap h-4 w-4"
                aria-hidden="true"
              />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p
          id={hintId}
          className="mb-0 text-xs text-tertiary"
        >
          {hint}
        </p>
      )}
      {capsLock && (
        <p
          id={capsId}
          className="mb-0 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          Caps Lock is on
        </p>
      )}
    </div>
  );
}

interface AuthErrorProps {
  message: string;
}

export function AuthError({ message }: AuthErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="auth-error flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );
}
