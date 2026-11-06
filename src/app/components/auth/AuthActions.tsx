import { Loader2 } from "lucide-react";
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
  children: ReactNode;
}

/** Divider-separated account block under the form (switch mode, go back). */
export function AuthAccount({ children }: AuthAccountProps) {
  return <div className="auth-account">{children}</div>;
}
