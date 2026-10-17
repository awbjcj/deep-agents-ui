/** A one-use composer prefill scoped to an immutable account and conversation. */
export interface SkillAuthoringRequest {
  id: string;
  accountId: string;
  threadId: string | null;
  text: string;
}

export function createSkillAuthoringRequest(
  accountId: string,
  threadId: string | null
): SkillAuthoringRequest {
  return {
    id: crypto.randomUUID(),
    accountId,
    threadId,
    text: "Help me create a personal skill. Ask what workflow it should support, draft SKILL.md and any text resources with me, and save it when I explicitly ask you to create or save it.",
  };
}

export function skillAuthoringRequestMatches(
  request: SkillAuthoringRequest,
  accountId: string | null | undefined,
  threadId: string | null
): boolean {
  return request.accountId === accountId && request.threadId === threadId;
}
