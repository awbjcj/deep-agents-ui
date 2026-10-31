import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
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
    <Button
      type="submit"
      className="auth-submit h-11 w-full cursor-pointer rounded-lg bg-[color:var(--auth-cta-bg)] text-sm font-bold text-[color:var(--auth-cta-fg)] shadow-none hover:bg-[color:var(--auth-cta-hover)] hover:shadow-none focus-visible:ring-2 focus-visible:ring-[var(--auth-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] active:scale-[0.98]"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
    >
      {isSubmitting ? (
        <>
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          />
          {pendingLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight
            className="auth-submit-arrow h-4 w-4"
            aria-hidden="true"
          />
        </>
      )}
    </Button>
  );
}

/** Divider-separated secondary action under an auth form (switch mode, go back). */
export function AuthAltAction({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 border-t border-secondary pt-6 text-sm text-secondary">
      {children}
    </div>
  );
}
