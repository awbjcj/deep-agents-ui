import type { ReactNode } from "react";

interface AuthHeadingProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  step?: { current: number; total: number };
}

export function AuthHeading({
  eyebrow,
  title,
  description,
  step,
}: AuthHeadingProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <span className="aptiv-eyebrow">{eyebrow}</span>
        {step && (
          <span
            role="img"
            aria-label={`Step ${step.current} of ${step.total}`}
            className="flex items-center gap-1.5"
          >
            {Array.from({ length: step.total }, (_, index) => (
              <span
                key={index}
                className={
                  index < step.current
                    ? "h-1 w-6 rounded-full bg-[var(--aptiv-orange)] transition-colors duration-200"
                    : "h-1 w-6 rounded-full bg-[var(--color-border)] transition-colors duration-200"
                }
              />
            ))}
          </span>
        )}
      </div>
      <h1 className="mt-2 font-[family-name:var(--font-family-heading)] text-[32px] font-bold leading-[1.05] tracking-normal text-primary">
        {title}
      </h1>
      <span
        className="aptiv-rule"
        aria-hidden="true"
      />
      <p className="mb-0 text-sm leading-relaxed text-secondary">
        {description}
      </p>
    </div>
  );
}
