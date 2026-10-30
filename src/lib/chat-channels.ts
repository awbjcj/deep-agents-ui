import { z } from "zod";
import { apiFetch, extractErrorMessage } from "@/lib/auth";
import { bindingSchema, type TeamsBinding } from "@/lib/teams-chat";

export const CHANNEL_IDS = ["teams", "slack", "telegram"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];
export type Transport = TeamsBinding["transport"];

/** Stored binding transport for each bot channel; `graph` is Teams self-chat. */
export const CHANNEL_TRANSPORT: Record<ChannelId, Transport> = {
  teams: "bot",
  slack: "slack",
  telegram: "telegram",
};

// Server-supplied links open in a new tab, so only accept HTTPS destinations.
const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "Expected an HTTPS URL");

const channelSchema = z.object({
  id: z.enum(CHANNEL_IDS),
  name: z.string().min(1),
  available: z.boolean(),
  linked: z.boolean(),
  linked_account: z.string().nullable(),
  bot_url: httpsUrl.nullable(),
  review_controls: z.enum(["card", "buttons", "reply"]),
  missing_settings: z.array(z.string()),
  /** A chat account that redeemed a code and waits for the owner's confirmation. */
  pending_link: z
    .object({
      external_user_id: z.string().min(1),
      display_name: z.string().nullable(),
      expires_at: z.number().finite(),
    })
    .nullable()
    .default(null),
});

const overviewSchema = z.object({
  binding: bindingSchema.nullable(),
  channels: z.array(channelSchema),
});

const linkCodeSchema = z.object({
  channel: z.enum(CHANNEL_IDS),
  command: z.string().min(1),
  open_url: httpsUrl.nullable(),
  code_prefilled: z.boolean(),
  expires_at: z.number().finite(),
});

export type ChatChannel = z.infer<typeof channelSchema>;
export type ChannelOverview = z.infer<typeof overviewSchema>;
export type LinkCode = z.infer<typeof linkCodeSchema>;

export class ChatChannelError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChatChannelError";
  }
}

async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  method = "GET",
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(`/chat-channels${path}`, { method, signal });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    let message = extractErrorMessage(
      data?.detail,
      "Could not reach chat app settings."
    );
    if (response.status === 404 && message === "Not Found") {
      message =
        "Chat apps are not available on this server yet. Ask an administrator to update it.";
    } else if (response.status === 503 && path.endsWith("/link-codes")) {
      // The link-code 503 names an operator setting; users need the action.
      message =
        "This app is not available on this server yet. Ask an administrator to enable it.";
    } else if (response.status === 409 && response.headers.has("Retry-After")) {
      message =
        "VSDA is finishing another operation. Wait a few seconds, then try again.";
    }
    throw new ChatChannelError(message, response.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ChatChannelError(
      "Could not verify the chat app settings returned by the server.",
      502
    );
  }
  return parsed.data;
}

/** The signed-in user's channels. Writes are never retried automatically. */
export const chatChannelsAPI = {
  overview: (signal?: AbortSignal) =>
    request(overviewSchema, "", "GET", signal),
  createLinkCode: (channel: ChannelId) =>
    request(linkCodeSchema, `/${channel}/link-codes`, "POST"),
  /** Link the chat account shown in `pending_link`; returns the new overview. */
  confirmLink: (channel: ChannelId) =>
    request(overviewSchema, `/${channel}/link-confirmation`, "POST"),
  cancelLink: (channel: ChannelId) =>
    request(z.null(), `/${channel}/link-confirmation`, "DELETE"),
  unlink: (channel: ChannelId) =>
    request(z.null(), `/${channel}/connection`, "DELETE"),
};

/** True once a chat account redeemed this channel's code (or it is linked). */
export function hasLinkProgress(
  overview: ChannelOverview,
  channel: ChannelId
): boolean {
  return (
    isLinkComplete(overview, channel) ||
    overview.channels.some((item) => item.id === channel && item.pending_link)
  );
}

/** The bot channel behind a binding transport, or null for Teams self-chat. */
export function channelOf(transport: Transport): ChannelId | null {
  return CHANNEL_IDS.find((id) => CHANNEL_TRANSPORT[id] === transport) ?? null;
}

/** True once the channel is the account's live, linked connection. */
export function isLinkComplete(
  overview: ChannelOverview,
  channel: ChannelId
): boolean {
  const binding = overview.binding;
  return Boolean(
    binding &&
      binding.transport === CHANNEL_TRANSPORT[channel] &&
      binding.enabled &&
      !binding.needs_reconnect &&
      overview.channels.some((item) => item.id === channel && item.linked)
  );
}

/**
 * Client-side deadline for a link code. The server issues five-minute codes;
 * a skewed client clock falls back to that lifetime instead of expiring early.
 */
export function linkDeadline(code: LinkCode, receivedAt: number): number {
  const lifetime = code.expires_at - receivedAt / 1000;
  return receivedAt + (lifetime > 0 && lifetime <= 300 ? lifetime : 300) * 1000;
}
