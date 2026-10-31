"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import {
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface AuthFieldProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  hint?: string;
  /** Inline validation message; marks the input invalid and describes it. */
  error?: string;
  /** Secondary control aligned with the label, e.g. "Forgot password?". */
  labelAction?: ReactNode;
  inputClassName?: string;
}

export function AuthField({
  id,
  label,
  hint,
  error,
  labelAction,
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
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;
  const describedBy =
    [
      error ? errorId : null,
      hint && !error ? hintId : null,
      capsLock ? capsId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label
          htmlFor={id}
          className="text-sm font-normal text-primary"
        >
          {label}
        </Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={inputProps.name ?? id}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "auth-input h-11 bg-[var(--color-surface)] px-3.5 text-base md:text-sm",
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
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-tertiary transition-colors duration-150 hover:bg-tertiary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-focus)] disabled:cursor-not-allowed disabled:opacity-50"
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
      {error && (
        <p
          id={errorId}
          className="auth-error mb-0 flex items-start gap-1.5 text-sm text-[color:var(--auth-error)]"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && (
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
          className="mb-0 text-xs text-[color:var(--auth-warning)]"
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

/** Form-level error for server responses that don't map to a single field. */
export function AuthError({ message }: AuthErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="auth-error flex items-start gap-2.5 rounded-lg border border-[color:var(--auth-error)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[color:var(--auth-error)]"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );
}
