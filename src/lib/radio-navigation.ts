import type { KeyboardEvent } from "react";

/** Move focus and selection together within a button-based radio group. */
export function navigateRadioGroup(event: KeyboardEvent<HTMLElement>) {
  const keys = [
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "Home",
    "End",
  ];
  if (!keys.includes(event.key)) return;
  const choices = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]:not(:disabled):not([aria-disabled="true"])'
    )
  );
  const current = choices.indexOf(event.target as HTMLButtonElement);
  if (current < 0 || choices.length === 0) return;
  let step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  if (
    ["ArrowLeft", "ArrowRight"].includes(event.key) &&
    getComputedStyle(event.currentTarget).direction === "rtl"
  )
    step *= -1;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
      ? choices.length - 1
      : (current + step + choices.length) % choices.length;
  event.preventDefault();
  choices[next].focus();
  choices[next].click();
}
