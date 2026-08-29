import { apiFetch, extractErrorMessage, type Role } from "@/lib/auth";

export interface NewsletterDraftInput {
  subject: string;
  body_markdown: string;
  target_tiers: Role[] | null;
}

export interface NewsletterPreview {
  id: string;
  recipient_count: number;
  body_html: string;
  status: string;
}

export interface NewsletterSummary {
  id: string;
  subject: string;
  status: string;
  created_by: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface NewsletterDelivery {
  id: number;
  recipient_email: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

export interface NewsletterDetail extends NewsletterSummary {
  body_markdown: string;
  body_html: string;
  target_tiers: Role[] | null;
  pending: number;
  sent: number;
  failed: number;
  deliveries: NewsletterDelivery[] | null;
}

async function newsletterJson<T>(
  response: Response,
  fallback: string
): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const suffix = response.status ? ` (${response.status})` : "";
    throw new Error(
      extractErrorMessage(
        (data as { detail?: unknown }).detail,
        `${fallback}${suffix}`
      )
    );
  }
  return data as T;
}

export async function apiListNewsletters(signal?: AbortSignal) {
  const response = await apiFetch("/admin/broadcasts", { signal });
  const data = await newsletterJson<{ broadcasts: NewsletterSummary[] }>(
    response,
    "Could not load newsletters"
  );
  return data.broadcasts;
}

export async function apiGetNewsletter(
  id: string,
  options: { includeRecipients?: boolean; signal?: AbortSignal } = {}
) {
  const query = options.includeRecipients ? "?include_recipients=true" : "";
  const response = await apiFetch(`/admin/broadcasts/${id}${query}`, {
    signal: options.signal,
  });
  return newsletterJson<NewsletterDetail>(
    response,
    "Could not load newsletter"
  );
}

export async function apiCreateNewsletter(payload: NewsletterDraftInput) {
  const response = await apiFetch("/admin/broadcasts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return newsletterJson<NewsletterPreview>(
    response,
    "Could not save newsletter"
  );
}

export async function apiUpdateNewsletter(
  id: string,
  payload: NewsletterDraftInput
) {
  const response = await apiFetch(`/admin/broadcasts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return newsletterJson<NewsletterPreview>(
    response,
    "Could not update newsletter"
  );
}

export async function apiTestNewsletter(id: string) {
  const response = await apiFetch(`/admin/broadcasts/${id}/test-send`, {
    method: "POST",
  });
  return newsletterJson<{ sent: boolean }>(response, "Test email failed");
}

export async function apiSendNewsletter(id: string) {
  const response = await apiFetch(`/admin/broadcasts/${id}/send`, {
    method: "POST",
  });
  return newsletterJson<{
    id: string;
    status: string;
    total_recipients: number;
  }>(response, "Could not send newsletter");
}

export async function apiDeleteNewsletter(id: string) {
  const response = await apiFetch(`/admin/broadcasts/${id}`, {
    method: "DELETE",
  });
  return newsletterJson<{ deleted: boolean }>(
    response,
    "Could not delete draft"
  );
}

export function newsletterProgress(newsletter: NewsletterDetail): number {
  if (newsletter.total_recipients <= 0) return 0;
  return Math.min(
    100,
    Math.round(
      ((newsletter.sent + newsletter.failed) / newsletter.total_recipients) *
        100
    )
  );
}
