import { cn } from "@/lib/utils";

export function MeterFill({
  percent,
  className,
}: {
  percent: number;
  className: string;
}) {
  const fraction = Math.min(100, Math.max(0, percent)) / 100;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-full w-full origin-left rounded-full transition-transform duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none",
        className
      )}
      style={{ transform: `scaleX(${fraction})` }}
    />
  );
}
