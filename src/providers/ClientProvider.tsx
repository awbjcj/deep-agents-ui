"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { Client } from "@langchain/langgraph-sdk";
import { createStreamModeCompatibilityClient } from "@/app/utils/langgraphStreamModes";

interface ClientContextValue {
  client: Client;
  deploymentUrl: string;
}

const ClientContext = createContext<ClientContextValue | null>(null);

interface ClientProviderProps {
  children: ReactNode;
  deploymentUrl: string;
  apiKey: string;
  accessToken: string;
}

export function ClientProvider({
  children,
  deploymentUrl,
  apiKey,
  accessToken,
}: ClientProviderProps) {
  const client = useMemo(() => {
    return createStreamModeCompatibilityClient(
      new Client({
        apiUrl: deploymentUrl,
        // Run creation has no idempotency key. A lost response must be
        // reconciled by message ID, never transparently replayed by the SDK.
        callerOptions: { maxRetries: 0 },
        defaultHeaders: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );
  }, [deploymentUrl, apiKey, accessToken]);

  const value = useMemo(
    () => ({ client, deploymentUrl }),
    [client, deploymentUrl]
  );

  return (
    <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
  );
}

/** Keep persisted conversation drafts isolated between API deployments. */
// eslint-disable-next-line react-refresh/only-export-components
export function useDeploymentUrl(): string {
  const context = useContext(ClientContext);
  if (!context)
    throw new Error("useDeploymentUrl must be used within a ClientProvider");
  return context.deploymentUrl.replace(/\/$/, "");
}

// eslint-disable-next-line react-refresh/only-export-components
export function useClient(): Client {
  const context = useContext(ClientContext);

  if (!context) {
    throw new Error("useClient must be used within a ClientProvider");
  }
  return context.client;
}
