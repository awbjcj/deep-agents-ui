"use client";

import { Check } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type CheckboxProps = Omit<ComponentProps<"input">, "type">;

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <span
      data-slot="checkbox-shell"
      className={cn("relative inline-flex size-5 shrink-0", className)}
    >
      <input
        data-slot="checkbox"
        type="checkbox"
        className="focus-visible:ring-[var(--aptiv-orange)]/45 peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-[5px] border-2 border-muted-foreground/70 bg-background shadow-sm transition-[border-color,background-color,box-shadow] duration-150 checked:border-[var(--aptiv-orange)] checked:bg-[var(--aptiv-orange)] checked:bg-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        {...props}
      />
      <Check
        data-slot="checkbox-indicator"
        className="pointer-events-none absolute inset-0 z-10 m-auto size-3.5 text-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100 motion-reduce:transition-none"
        strokeWidth={3}
        aria-hidden="true"
      />
    </span>
  );
}

export { Checkbox };
