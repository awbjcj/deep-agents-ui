export interface StandaloneConfig {
  deploymentUrl: string;
  assistantId: string;
  langsmithApiKey?: string;
}

const CONFIG_KEY = "deep-agent-config";

export function getDeploymentUrl(): string {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_URL || "";
}

export function getLangsmithApiKey(): string {
  return process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "";
}

export function getConfig(): StandaloneConfig | null {
  if (typeof window === "undefined") return null;

  const deploymentUrl = getDeploymentUrl();
  if (!deploymentUrl) return null;

  const stored = localStorage.getItem(CONFIG_KEY);
  const parsed = stored ? safeParse(stored) : null;

  return {
    deploymentUrl,
    assistantId: parsed?.assistantId || "",
    langsmithApiKey: getLangsmithApiKey() || undefined,
  };
}

export function saveAssistantId(assistantId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ assistantId }));
}

export function saveConfig(config: StandaloneConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ assistantId: config.assistantId }));
}

function safeParse(json: string): Record<string, string> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
