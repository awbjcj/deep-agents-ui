import { apiFetch, extractErrorMessage } from "@/lib/auth";

export const requestLabels = {
  usage_reset: "Weekly usage reset",
  token_limit_increase: "Token limit increase",
  developer_access: "Developer access",
  account_deletion: "Account deletion",
} as const;

export function requestDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export type AccountRequestType = keyof typeof requestLabels;
export type AccountRequestStatus =
  "pending" | "fulfilled" | "declined" | "withdrawn" | "closed";

export type CreateAccountRequest =
  | { type: "usage_reset" | "developer_access"; reason: string }
  | { type: "token_limit_increase"; reason: string; requested_limit: number }
  | { type: "account_deletion"; current_password: string };

type AccountRequestResult =
  | { type: "usage_reset"; cycle_end: string | null }
  | { type: "token_limit_increase"; approved_limit: number; expires_at: string }
  | { type: "developer_access"; role: "developer" }
  | { type: "account_deletion" };

export interface AccountRequest {
  id: string;
  type: AccountRequestType;
  status: AccountRequestStatus;
  reason: string | null;
  requested_limit: number | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  result: AccountRequestResult | null;
}

export interface AccountRequestOption {
  type: AccountRequestType;
  available: boolean;
  disabled_reason: string | null;
  pending_request_id: string | null;
  current_limit: number | null;
  cycle_end: string | null;
  developer_capabilities?: string[];
}

export interface AdminAccountRequest extends AccountRequest {
  account_id: string;
  username: string | null;
  role: string | null;
  decision_actor_id: string | null;
}

export interface AccountRequestReview {
  cycle_end?: string | null;
  cycle_start?: string | null;
  token_limit?: number | null;
  used?: number | null;
  calls_used?: number | null;
  cost_used_micros?: number | null;
  developer_capabilities?: string[];
  starts_cycle_on_approval?: boolean;
  unavailable_reason?: string | null;
  closes_if_applied?: boolean;
}

export interface AdminAccountRequestDetail extends AdminAccountRequest {
  review_version: string;
  review: AccountRequestReview | null;
}

export type AccountRequestDecision =
  | { action: "approve"; review_version: string; approved_limit?: number }
  | { action: "decline"; reason: string }
  | {
      action: "fulfill";
      review_version: string;
      shared_ownership_confirmed: true;
    };

interface AccountRequestPage<T> {
  items: T[];
  next_cursor: string | null;
}

const userRequests = "/user/account-requests";
const adminRequests = "/admin/account-requests";

export class AccountRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly currentRequest?: AccountRequest
  ) {
    super(message);
    this.name = "AccountRequestError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, options);
  if (response.ok) return response.json() as Promise<T>;
  const body: { detail?: unknown } = await response.json().catch(() => ({}));
  const detail = body.detail as
    | { code?: string; request_id?: string; request?: AccountRequest }
    | undefined;
  throw new AccountRequestError(
    extractErrorMessage(body.detail, "The request could not be processed."),
    response.status,
    detail?.code,
    detail?.request_id,
    detail?.request
  );
}

function mutation(
  method: "POST" | "PATCH",
  input: object,
  key: string
): RequestInit {
  return {
    method,
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(input),
  };
}

export async function getAccountRequestOptions(): Promise<
  AccountRequestOption[]
> {
  const result = await request<{ items: AccountRequestOption[] }>(
    "/user/account-request-options"
  );
  return result.items;
}

export function createAccountRequest(input: CreateAccountRequest, key: string) {
  return request<AccountRequest>(userRequests, mutation("POST", input, key));
}

export function listAccountRequests(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<AccountRequestPage<AccountRequest>>(`${userRequests}${query}`);
}

export function getAccountRequest(id: string) {
  return request<AccountRequest>(`${userRequests}/${encodeURIComponent(id)}`);
}

export function withdrawAccountRequest(id: string, key: string) {
  return request<AccountRequest>(
    `${userRequests}/${encodeURIComponent(id)}`,
    mutation("PATCH", { action: "withdraw" }, key)
  );
}

export function listAdminAccountRequests(
  status: "pending" | "history",
  type?: AccountRequestType,
  cursor?: string
) {
  const params = new URLSearchParams({ status });
  if (type) params.set("type", type);
  if (cursor) params.set("cursor", cursor);
  return request<AccountRequestPage<AdminAccountRequest>>(
    `${adminRequests}?${params}`
  );
}

export function getAdminAccountRequest(id: string) {
  return request<AdminAccountRequestDetail>(
    `${adminRequests}/${encodeURIComponent(id)}`
  );
}

export function decideAccountRequest(
  id: string,
  decision: AccountRequestDecision,
  key: string
) {
  return request<AdminAccountRequest>(
    `${adminRequests}/${encodeURIComponent(id)}`,
    mutation("PATCH", decision, key)
  );
}
