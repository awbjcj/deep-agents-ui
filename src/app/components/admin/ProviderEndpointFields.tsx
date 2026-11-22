"use client";

import { SavedSetting } from "@/app/components/settings/SavedSetting";

import { LockKeyhole } from "lucide-react";

import { formatTimestamp } from "@/app/utils/utils";
import { ConnectivityTokenField } from "@/app/components/admin/ConnectivityTokenField";
import {
  CONNECTION_MODES,
  ENDPOINT_PROVIDERS,
} from "@/components/connectivity/modes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminConnectivityResponse } from "@/lib/auth";

/** Identical URL and authentication columns for each provider connection mode. */
export function ProviderEndpointFields({
  provider,
  connectivity,
  urls,
  tokens,
  disabled,
  onUrlChange,
  onTokenChange,
}: {
  provider: (typeof ENDPOINT_PROVIDERS)[number];
  connectivity: AdminConnectivityResponse;
  urls: Record<string, string>;
  tokens: Record<string, string>;
  disabled: boolean;
  onUrlChange: (key: string, value: string) => void;
  onTokenChange: (key: string, value: string | undefined) => void;
}) {
  return (
    <fieldset className="border-border @container min-w-0 rounded-lg border px-4">
      <legend className="text-foreground px-1 text-sm font-semibold">
        {provider.label}
      </legend>
      <div className="divide-border divide-y">
        {CONNECTION_MODES.map((mode) => {
          const key = `${provider.prefix}_base_url${
            mode.id === "remote" ? "" : `_${mode.id}`
          }`;
          const tokenKey = `${provider.prefix}_api_key_${mode.id}`;
          const info = connectivity.urls[key];
          const value = urls[key] ?? "";
          const changed = value !== (info?.value ?? "");
          return (
            <div
              key={mode.id}
              className="space-y-3 py-4"
              data-connectivity-mode={mode.id}
            >
              <SavedSetting
                key={JSON.stringify([
                  info?.updated_at,
                  connectivity.tokens?.[tokenKey]?.updated_at,
                ])}
                title={mode.label}
                status={
                  info?.source === "database" ||
                  connectivity.tokens?.[tokenKey]?.overridden
                    ? "Saved"
                    : undefined
                }
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-foreground text-xs font-semibold">
                    {mode.label}
                  </span>
                  <span className="text-xxs text-muted-foreground">
                    {mode.description}
                  </span>
                </div>
                <div className="grid grid-cols-1 items-start gap-3 @xl:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label
                      htmlFor={`runtime-${key}`}
                      className="text-foreground block text-xs leading-5 font-medium"
                    >
                      Base URL
                    </Label>
                    <Input
                      id={`runtime-${key}`}
                      aria-label={`${provider.label} ${mode.id} base URL`}
                      aria-describedby={`runtime-${key}-status`}
                      type="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={value}
                      disabled={disabled}
                      onChange={(event) => onUrlChange(key, event.target.value)}
                      placeholder="Use environment default"
                      className="h-10 rounded-md font-mono text-lg @sm:text-xs"
                    />
                    <p
                      id={`runtime-${key}-status`}
                      className="text-xxs text-muted-foreground leading-relaxed"
                    >
                      {changed
                        ? value
                          ? "URL change · not saved"
                          : "Will use environment default"
                        : info?.source === "database"
                          ? "Admin override"
                          : "Environment default"}
                      {!changed &&
                      info?.source === "database" &&
                      info.updated_at
                        ? ` · ${formatTimestamp(info.updated_at)}`
                        : ""}
                    </p>
                  </div>
                  {mode.id !== "proxy" ? (
                    <ConnectivityTokenField
                      settingKey={tokenKey}
                      label={`${provider.label} ${mode.id} token (optional)`}
                      info={connectivity.tokens?.[tokenKey]}
                      draft={tokens[tokenKey]}
                      disabled={disabled}
                      onChange={(value) => onTokenChange(tokenKey, value)}
                    />
                  ) : (
                    <div className="min-w-0 space-y-1.5">
                      <span className="text-foreground block text-xs leading-5 font-medium">
                        Authentication
                      </span>
                      <div className="border-border bg-muted/30 text-muted-foreground flex h-10 items-center gap-2 rounded-md border border-dashed px-3 text-xs">
                        <LockKeyhole
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        Managed by proxy
                      </div>
                      <p className="text-xxs text-muted-foreground leading-relaxed">
                        Provider tokens are not sent to the proxy.
                      </p>
                    </div>
                  )}
                </div>
              </SavedSetting>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
