export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "pending" | "completed" | "error" | "interrupted";
}

export interface SubAgent {
  id: string;
  name: string;
  subAgentName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "pending" | "active" | "completed" | "error";
}

export interface FileItem {
  path: string;
  content: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  updatedAt?: Date;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InterruptData {
  value: any;
  ns?: string[];
  scope?: string;
}

export interface ActionRequest {
  name: string;
  args: Record<string, unknown>;
  description?: string;
}

export type HumanDecisionType = "approve" | "edit" | "reject";

export interface ReviewConfig {
  actionName: string;
  allowedDecisions?: HumanDecisionType[];
}

export interface RawReviewConfig {
  actionName?: string;
  allowedDecisions?: HumanDecisionType[];
  action_name?: string;
  allowed_decisions?: HumanDecisionType[];
}

export interface EditedAction {
  name: string;
  args: Record<string, unknown>;
}

export type HumanDecision =
  | { type: "approve" }
  | { type: "reject"; message?: string }
  | { type: "edit"; edited_action: EditedAction };

export interface ResumeInterruptValue {
  decisions: HumanDecision[];
}

export interface ToolApprovalInterruptData {
  action_requests: ActionRequest[];
  review_configs?: RawReviewConfig[];
}
