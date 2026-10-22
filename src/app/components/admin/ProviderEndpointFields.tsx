"use client";

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
    <fieldset className="min-w-0 rounded-lg border border-border px-4 @container">
      <legend className="px-1 text-sm font-semibold text-foreground">
        {provider.label}
      </legend>
      <div className="divide-y divide-border">
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
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-foreground">
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
                    className="block text-xs font-medium leading-5 text-foreground"
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
                    className="text-xxs leading-relaxed text-muted-foreground"
                  >
                    {changed
                      ? value
                        ? "URL change · not saved"
                        : "Will use environment default"
                      : info?.source === "database"
                      ? "Admin override"
                      : "Environment default"}
                    {!changed && info?.source === "database" && info.updated_at
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
                    <span className="block text-xs font-medium leading-5 text-foreground">
                      Authentication
                    </span>
                    <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 text-xs text-muted-foreground">
                      <LockKeyhole
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      Managed by proxy
                    </div>
                    <p className="text-xxs leading-relaxed text-muted-foreground">
                      Provider tokens are not sent to the proxy.
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
