import { readBrowserStorage, writeBrowserStorage } from "@/lib/browserStorage";
import { canonicalAssistantId } from "@/lib/assistant-identity";

export interface StandaloneConfig {
  deploymentUrl: string;
  assistantId: string;
  langsmithApiKey?: string;
  analysisEngine?: "deep_agent" | "copilot";
}

const CONFIG_KEY = "deep-agent-config";

/** Deployment URL value that makes the UI call the origin it was loaded from. */
export const SAME_ORIGIN_DEPLOYMENT_URL = "same-origin";

/**
 * Return the LangGraph/FastAPI base URL the browser should call.
 *
 * An absolute `NEXT_PUBLIC_DEPLOYMENT_URL` wins. `same-origin`, or an unset
 * value in a static export (which the backend always serves under `/chat`),
 * resolves to the page's own origin so one build works on any host and port:
 * a local Compose stack, a native run, a desktop shell, or a reverse proxy.
 */
export function getDeploymentUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_DEPLOYMENT_URL || "").trim();
  if (configured && configured !== SAME_ORIGIN_DEPLOYMENT_URL) {
    return configured;
  }
  const sameOrigin =
    configured === SAME_ORIGIN_DEPLOYMENT_URL ||
    process.env.NEXT_PUBLIC_VSDA_STATIC_EXPORT === "1";
  if (!sameOrigin || typeof window === "undefined") return "";
  const origin = window.location?.origin;
  return origin && /^https?:\/\//i.test(origin) ? origin : "";
}

export function getLangsmithApiKey(): string {
  return process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";
}

export function getConfig(): StandaloneConfig | null {
  if (typeof window === "undefined") return null;

  const deploymentUrl = getDeploymentUrl();
  if (!deploymentUrl) return null;

  const stored = readBrowserStorage(CONFIG_KEY);
  const parsed = stored ? safeParse(stored) : null;

  return {
    deploymentUrl,
    assistantId: canonicalAssistantId(parsed?.assistantId || ""),
    langsmithApiKey: getLangsmithApiKey() || undefined,
    analysisEngine:
      parsed?.analysisEngine === "deep_agent" ||
      parsed?.analysisEngine === "copilot"
        ? parsed.analysisEngine
        : undefined,
  };
}

export function saveAssistantId(assistantId: string): void {
  if (typeof window === "undefined") return;
  writeBrowserStorage(
    CONFIG_KEY,
    JSON.stringify({ assistantId: canonicalAssistantId(assistantId) })
  );
}

export function saveConfig(config: StandaloneConfig): void {
  if (typeof window === "undefined") return;
  writeBrowserStorage(
    CONFIG_KEY,
    JSON.stringify({
      assistantId: canonicalAssistantId(config.assistantId),
      ...(config.analysisEngine
        ? { analysisEngine: config.analysisEngine }
        : {}),
    })
  );
}

function safeParse(json: string): Record<string, string> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
