import type { ReactNode } from "react";

interface AuthHeadingProps {
  title: string;
  description?: ReactNode;
  step?: { current: number; total: number };
}

export function AuthHeading({ title, description, step }: AuthHeadingProps) {
  return (
    <>
      <div
        className={
          step ? "auth-card__head auth-card__head--steps" : "auth-card__head"
        }
      >
        <h1 className="auth-card__title">{title}</h1>
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
      {!step && (
        <span
          className="auth-rule"
          aria-hidden="true"
        />
      )}
      {description && <p className="auth-card__lede">{description}</p>}
    </>
  );
}
