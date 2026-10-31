"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Eye, EyeOff, Info } from "lucide-react";
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
    <div className="auth-field">
      <div className="auth-field__row">
        <label
          className="auth-field__label"
          htmlFor={id}
        >
          {label}
        </label>
        {labelAction}
      </div>
      <div className="auth-field__control">
        <input
          id={id}
          name={inputProps.name ?? id}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "auth-field__input",
            isPassword && "auth-field__input--with-action",
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
            className="auth-field__action"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            aria-controls={id}
            disabled={inputProps.disabled}
          >
            {revealed ? (
              <EyeOff
                className="auth-icon"
                aria-hidden="true"
              />
            ) : (
              <Eye
                className="auth-icon"
                aria-hidden="true"
              />
            )}
          </button>
        )}
      </div>
      {error && (
        <p
          id={errorId}
          className="auth-field__error"
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          id={hintId}
          className="auth-field__hint"
        >
          {hint}
        </p>
      )}
      {capsLock && (
        <p
          id={capsId}
          className="auth-field__caps"
        >
          Caps Lock is on
        </p>
      )}
    </div>
  );
}

interface AuthStatusProps {
  message: ReactNode;
  tone?: "error" | "info";
}

/** Form-level status: server errors (alert) or confirmations (status). */
export function AuthStatus({ message, tone = "error" }: AuthStatusProps) {
  if (!message) return null;
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`auth-status auth-status--${tone}`}
    >
      <Icon
        className="auth-icon"
        aria-hidden="true"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">{message}</span>
    </div>
  );
}
