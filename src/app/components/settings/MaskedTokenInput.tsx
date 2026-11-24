"use client";

import type { ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MaskedTokenInput({
  id,
  tokenLabel,
  revealed,
  onToggle,
  ...input
}: Pick<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "placeholder" | "disabled"
> & {
  id: string;
  tokenLabel: string;
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        {...input}
        id={id}
        type={revealed ? "text" : "password"}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="min-h-touch pr-12"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${revealed ? "Hide" : "Show"} ${tokenLabel}`}
        aria-controls={id}
        disabled={input.disabled}
        onClick={onToggle}
        className="text-muted-foreground size-touch absolute inset-y-0 right-0"
      >
        {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
