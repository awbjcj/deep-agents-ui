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
      className="auth-submit mt-2 h-11 w-full cursor-pointer rounded-lg text-sm font-semibold active:scale-[0.98]"
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
    <div className="mt-8 border-t border-secondary pt-6 text-center text-sm">
      {children}
    </div>
  );
}

export const authLinkClassName =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-semibold text-brand-primary transition-opacity duration-150 hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
