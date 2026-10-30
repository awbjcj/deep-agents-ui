import { z } from "zod";
import { apiFetch } from "@/lib/auth";

/** How pending tool reviews are resolved in a conversation. */
export const APPROVAL_MODES = [
  "interactive",
  "allow_read",
  "autopilot",
] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export type AutomaticApprovalMode = Exclude<ApprovalMode, "interactive">;

export const APPROVAL_MODE_COPY: Record<
  ApprovalMode,
  { label: string; summary: string; status: string }
> = {
  interactive: {
    label: "Interactive",
    summary: "You review every action that asks for approval.",
    status: "Interactive. You approve each action.",
  },
  allow_read: {
    label: "Allow reads",
    summary: "Searches and reads run automatically. Writes still ask.",
    status:
      "Allow reads. Read-only actions are approved automatically; writes still need you.",
  },
  autopilot: {
    label: "Autopilot",
    summary: "Every action is approved automatically, including writes.",
    status: "Autopilot on. Actions are approved automatically.",
  },
};

const approvalPolicySchema = z.object({
  default_mode: z.enum(APPROVAL_MODES),
  available_modes: z.array(z.enum(APPROVAL_MODES)),
  read_tools: z.array(z.string().min(1)),
});

export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

/** Read the server's selectable modes and read-only tool inventory. */
export async function apiGetApprovalPolicy(
  signal?: AbortSignal
): Promise<ApprovalPolicy> {
  const res = await apiFetch("/user/approval-policy", { signal });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Allow reads isn't available on this server yet."
        : "Couldn't load the approval policy. Manual approval remains on."
    );
  }
  const parsed = approvalPolicySchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      "The server returned an invalid approval policy. Manual approval remains on."
    );
  }
  return parsed.data;
}
