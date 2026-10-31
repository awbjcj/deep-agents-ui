/** Inline text link used across auth screens (switch mode, back, recovery). */
export const authLinkClassName =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-sm font-bold text-primary underline decoration-[var(--color-border)] underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]";

/** Subtle link aligned with a field label, e.g. "Forgot password?". */
export const authLabelLinkClassName =
  "rounded-sm text-sm text-secondary underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-focus)]";
