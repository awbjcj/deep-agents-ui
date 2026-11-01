import { canonicalAssistantId } from "@/lib/assistant-identity";
import { DEFAULT_ASSISTANT_ID } from "@/lib/chat-links";

/** Task-focused supervisor; only accounts the server enrolled may run it. */
export const TASK_AGENT_ID = "VSDA Task Agent";
/** Isolated source-code analysis graph; developer and admin accounts only. */
export const CODE_ANALYZER_AGENT_ID = "VSDA Code Analyzer Agent";

/** Built-in graphs ordinary `user` accounts must never see or select. */
export const RESTRICTED_AGENT_IDS: readonly string[] = [
  TASK_AGENT_ID,
  CODE_ANALYZER_AGENT_ID,
];

/** Access flags from `GET /api/user/profile`, as stored on the signed-in user. */
export interface AgentAccess {
  role?: string | null;
  can_use_task_agent?: boolean | null;
  can_use_code_analyzer?: boolean | null;
}

function privileged(role?: string | null): boolean {
  return role === "admin" || role === "developer";
}

/** Read the profile's access flags, treating anything missing as no access. */
export function agentAccessFlags(profile: {
  can_use_task_agent?: unknown;
  can_use_code_analyzer?: unknown;
}): { can_use_task_agent: boolean; can_use_code_analyzer: boolean } {
  return {
    can_use_task_agent: profile.can_use_task_agent === true,
    can_use_code_analyzer: profile.can_use_code_analyzer === true,
  };
}

/**
 * True once a profile refresh has recorded both access flags. Until then the
 * restricted agents stay hidden, but saved selections are not rewritten.
 */
export function agentAccessKnown(access?: AgentAccess | null): boolean {
  return (
    typeof access?.can_use_task_agent === "boolean" &&
    typeof access?.can_use_code_analyzer === "boolean"
  );
}

export function canUseTaskAgent(access?: AgentAccess | null): boolean {
  return privileged(access?.role) && access?.can_use_task_agent === true;
}

export function canUseCodeAnalyzer(access?: AgentAccess | null): boolean {
  return privileged(access?.role) && access?.can_use_code_analyzer === true;
}

export function isRestrictedAgent(graphId?: string | null): boolean {
  return (
    !!graphId && RESTRICTED_AGENT_IDS.includes(canonicalAssistantId(graphId))
  );
}

/** Whether the account may see and select an assistant built on `graphId`. */
export function canUseAgent(
  graphId: string | null | undefined,
  access?: AgentAccess | null
): boolean {
  const id = graphId ? canonicalAssistantId(graphId) : "";
  if (id === TASK_AGENT_ID) return canUseTaskAgent(access);
  if (id === CODE_ANALYZER_AGENT_ID) return canUseCodeAnalyzer(access);
  return true;
}

/** Canonical assistant ID, replaced by the default when the account lacks access. */
export function allowedAssistantId(
  assistantId: string,
  access?: AgentAccess | null
): string {
  const id = canonicalAssistantId(assistantId);
  return canUseAgent(id, access) ? id : DEFAULT_ASSISTANT_ID;
}

/** Drop assistant options whose graph the account may not use. */
export function allowedAssistants<T extends { graphId: string }>(
  options: readonly T[],
  access?: AgentAccess | null
): T[] {
  return options.filter((option) => canUseAgent(option.graphId, access));
}
