"use client";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectivityTokenInfo } from "@/lib/auth";

/** A write-only credential with explicit replace, reset, and pending states. */
export function ConnectivityTokenField({
  settingKey,
  label,
  info,
  draft,
  disabled,
  onChange,
}: {
  settingKey: string;
  label: string;
  info?: ConnectivityTokenInfo;
  draft?: string;
  disabled: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const id = `runtime-${settingKey}`;
  const resetting = draft === "";
  const status = resetting
    ? "Override will be cleared on save"
    : draft
      ? "New token · not saved"
      : info?.overridden
        ? "Token override configured"
        : info?.configured
          ? "Using environment token"
          : "No token configured";

  return (
    <div
      className="min-w-0 space-y-1.5"
      data-connectivity-token={settingKey}
    >
      <SavedSetting
        key={info?.updated_at}
        title={label}
        status={
          settingKey === "cf_aig_token" && info?.overridden
            ? "Saved"
            : undefined
        }
      >
        <Label
          htmlFor={id}
          className="text-foreground block text-xs leading-5 font-medium"
        >
          Token{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            aria-label={label}
            aria-describedby={`${id}-status`}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={draft ?? ""}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value || undefined)}
            placeholder={info?.configured ? "Enter replacement" : "Enter token"}
            className="h-10 min-w-0 rounded-md font-mono text-lg @sm:text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || (!info?.overridden && draft === undefined)}
            onClick={() => onChange(resetting ? undefined : "")}
            aria-label={`${resetting ? "Undo reset" : "Reset"} ${label}`}
            className="text-xxs h-10"
          >
            {resetting ? "Undo" : "Reset"}
          </Button>
        </div>
        <p
          id={`${id}-status`}
          className="text-xxs text-muted-foreground leading-relaxed"
          role="status"
        >
          {status}
        </p>
      </SavedSetting>
    </div>
  );
}
