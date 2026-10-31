import type { ReactNode } from "react";

interface AuthHeadingProps {
  title: string;
  description: ReactNode;
  step?: { current: number; total: number; label: string };
}

export function AuthHeading({ title, description, step }: AuthHeadingProps) {
  return (
    <div className="mb-8">
      {step && (
        <div className="mb-6 flex items-center gap-3">
          <span
            className="flex items-center gap-1.5"
            aria-hidden="true"
          >
            {Array.from({ length: step.total }, (_, index) => (
              <span
                key={index}
                className={
                  index < step.current
                    ? "h-1 w-6 rounded-full bg-[var(--auth-cta-bg)] transition-colors duration-200"
                    : "h-1 w-6 rounded-full bg-[var(--color-border)] transition-colors duration-200"
                }
              />
            ))}
          </span>
          <span className="text-xs text-secondary">
            Step {step.current} of {step.total} · {step.label}
          </span>
        </div>
      )}
      <h1 className="mb-0 font-[family-name:var(--font-family-heading)] text-[32px] font-bold leading-[1.15] tracking-normal text-primary [text-wrap:balance]">
        {title}
      </h1>
      <p className="mb-0 mt-3 text-sm leading-normal text-secondary [text-wrap:pretty]">
        {description}
      </p>
    </div>
  );
}
