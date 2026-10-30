import {
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleSlash,
  Hash,
  Link2,
  MessageSquare,
  Send,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  CHANNEL_TRANSPORT,
  channelOf,
  type ChannelId,
  type ChatChannel,
  type Transport,
} from "@/lib/chat-channels";
import type { TeamsBinding } from "@/lib/teams-chat";

export interface ChannelMeta {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Where the conversation happens, phrased as a noun. */
  place: string;
  /** How approvals and questions look in this app. */
  reviews: string;
  open: string;
  /** Instruction after the code is issued, when the URL already contains it. */
  sendPrefilled: string;
  /** Instruction when the user has to paste the command. */
  sendManual: string;
}

export const CHANNEL_META: Record<ChannelId, ChannelMeta> = {
  teams: {
    label: "Microsoft Teams",
    short: "Teams",
    icon: UsersRound,
    place: "Personal chat with the VSDA bot",
    reviews:
      "Review cards: choose Approve or Reject, then submit. Questions include an answer field.",
    open: "Open in Teams",
    sendPrefilled: "Teams opens with the command ready. Select Send.",
    sendManual:
      "Open your chat with the VSDA bot in Teams, then paste and send the command.",
  },
  slack: {
    label: "Slack",
    short: "Slack",
    icon: Hash,
    place: "Direct message with the VSDA app",
    reviews:
      "Approve and Reject buttons, with a confirmation before approving. Questions include an answer field.",
    open: "Open Slack",
    sendPrefilled: "Slack opens your direct message. Send the command.",
    sendManual:
      "Open your direct message with the VSDA app, then paste and send the command.",
  },
  telegram: {
    label: "Telegram",
    short: "Telegram",
    icon: Send,
    place: "Private chat with the VSDA bot",
    reviews: "Approve and Reject buttons. Answer a question by replying to it.",
    open: "Open Telegram",
    sendPrefilled:
      "Telegram opens the VSDA bot. Select Start to send the code.",
    sendManual:
      "Open the VSDA bot in Telegram, then paste and send the command.",
  },
};

export const SELF_CHAT_META: ChannelMeta = {
  label: "Teams self-chat",
  short: "Teams self-chat",
  icon: MessageSquare,
  place: "Your private chat with yourself",
  reviews: "Text commands, with a link to review in the web conversation.",
  open: "Open in Teams",
  sendPrefilled: "",
  sendManual: "",
};

export function metaForTransport(transport: Transport): ChannelMeta {
  const channel = channelOf(transport);
  return channel ? CHANNEL_META[channel] : SELF_CHAT_META;
}

export type StatusTone =
  | "active"
  | "paused"
  | "linked"
  | "available"
  | "unavailable"
  | "attention";

export interface ChannelStatus {
  tone: StatusTone;
  label: string;
}

export const STATUS_ICON: Record<StatusTone, LucideIcon> = {
  active: CircleCheck,
  paused: CirclePause,
  linked: Link2,
  available: CircleDashed,
  unavailable: CircleSlash,
  attention: TriangleAlert,
};

/** One status per channel, from the user's point of view. */
export function channelStatus(
  channel: ChatChannel,
  binding: TeamsBinding | null
): ChannelStatus {
  const active = binding?.transport === CHANNEL_TRANSPORT[channel.id];
  if (active && binding?.needs_reconnect)
    return { tone: "attention", label: "Needs relink" };
  if (!channel.available)
    return {
      tone: "unavailable",
      label: active ? "Unavailable" : "Not set up",
    };
  if (channel.pending_link) return { tone: "attention", label: "Confirm link" };
  if (active && channel.linked)
    return binding?.enabled
      ? { tone: "active", label: "Active" }
      : { tone: "paused", label: "Paused" };
  if (channel.linked) return { tone: "linked", label: "Linked before" };
  return { tone: "available", label: "Ready to link" };
}
