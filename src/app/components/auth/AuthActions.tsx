import { KeyRound, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface AuthSubmitButtonProps {
  isSubmitting: boolean;
  pendingLabel: string;
  children: ReactNode;
}

export function AuthSubmitButton({
  isSubmitting,
  pendingLabel,
  children,
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      className="auth-button"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
    >
      {isSubmitting && (
        <Loader2
          className="auth-icon animate-spin"
          aria-hidden="true"
        />
      )}
      {isSubmitting ? pendingLabel : children}
    </button>
  );
}

interface AuthAccountProps {
  /** Optional heading block, e.g. "One account for VSDA tools". */
  title?: string;
  text?: string;
  children: ReactNode;
}

/** Divider-separated account block under the form (switch mode, go back). */
export function AuthAccount({ title, text, children }: AuthAccountProps) {
  return (
    <div className="auth-account">
      {title && (
        <div className="auth-account__head">
          <KeyRound
            className="auth-icon"
            aria-hidden="true"
          />
          <h2 className="auth-account__title">{title}</h2>
        </div>
      )}
      {text && <p className="auth-account__text">{text}</p>}
      <div className="auth-account__links">{children}</div>
    </div>
  );
}
