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
    <>
      <div className="auth-card__head">
        <p className="auth-eyebrow">{eyebrow}</p>
        {step && (
          <span
            role="img"
            aria-label={`Step ${step.current} of ${step.total}`}
            className="auth-steps"
          >
            {Array.from({ length: step.total }, (_, index) => (
              <span
                key={index}
                className="auth-steps__bar"
                data-active={index < step.current}
              />
            ))}
          </span>
        )}
      </div>
      <h1 className="auth-card__title">{title}</h1>
      <span
        className="auth-rule"
        aria-hidden="true"
      />
      <p className="auth-card__lede">{description}</p>
    </>
  );
}
