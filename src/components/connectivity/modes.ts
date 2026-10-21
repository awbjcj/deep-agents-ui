import type { RunMode } from "@/lib/auth";

export const CONNECTION_MODES = [
  { id: "remote", label: "Remote", description: "Direct to provider" },
  { id: "gateway", label: "Gateway", description: "Through a gateway" },
  { id: "proxy", label: "Proxy", description: "Through a proxy" },
] as const satisfies readonly {
  id: RunMode;
  label: string;
  description: string;
}[];

export const ENDPOINT_PROVIDERS = [
  { id: "openai", label: "OpenAI", prefix: "openai" },
  { id: "anthropic", label: "Anthropic", prefix: "claude" },
  { id: "google", label: "Gemini", prefix: "google" },
  { id: "xai", label: "xAI Grok", prefix: "xai" },
] as const;
