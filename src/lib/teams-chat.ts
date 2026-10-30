import { z } from "zod";
import { apiFetch, extractErrorMessage } from "@/lib/auth";

export const bindingSchema = z.object({
  chat_id: z.string().min(1),
  transport: z.enum(["graph", "bot", "slack", "telegram"]).default("graph"),
  graph_user_id: z.string().min(1),
  thread_id: z.string().min(1),
  enabled: z.boolean(),
  worker_enabled: z.boolean(),
  needs_reconnect: z.boolean().default(false),
  mode: z.enum(["interactive", "autopilot"]),
  last_error: z.string().nullable(),
  review: z.record(z.string(), z.unknown()).nullable(),
  last_scan_at: z.number().finite(),
});

const chatPageSchema = z.object({
  graph_user_id: z.string().min(1),
  chats: z.array(
    z.object({
      id: z.string().min(1),
      topic: z.string().nullable(),
      chat_type: z.string().nullable(),
      self_chat_candidate: z.boolean(),
    })
  ),
  next_cursor: z.string().nullable(),
});

export type TeamsBinding = z.infer<typeof bindingSchema>;

export class TeamsChatError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TeamsChatError";
  }
}

async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(`/teams-chat${path}`, {
    method,
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    let message = extractErrorMessage(
      data?.detail,
      "Could not reach Teams chat settings."
    );
    if (response.status === 503 && message.includes("TEAMS_CHAT_ENABLED")) {
      message =
        "Teams chat is not available on this server yet. Ask an administrator to enable it.";
    }
    if (response.status === 404 && message === "Not Found") {
      message =
        "Teams chat settings are not available on this server yet. Ask an administrator to update it.";
    }
    if (response.status === 409 && response.headers.has("Retry-After")) {
      message =
        "Teams is finishing another operation. Wait a few seconds, then try again.";
    }
    throw new TeamsChatError(message, response.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new TeamsChatError(
      "Could not verify the Teams settings returned by the server.",
      502
    );
  }
  return parsed.data;
}

/** Read and change only the authenticated user's connection. Writes never retry. */
export const teamsChatAPI = {
  status: async (): Promise<TeamsBinding | null> => {
    try {
      return await request(bindingSchema, "/binding?limit=1");
    } catch (error) {
      // A missing route on an older deployment is not an unconnected account.
      if (
        error instanceof TeamsChatError &&
        error.status === 404 &&
        error.message === "Teams chat is not connected"
      )
        return null;
      throw error;
    }
  },
  chats: (signal?: AbortSignal) =>
    request(chatPageSchema, "/chats", "GET", undefined, signal),
  connect: (chatId: string) =>
    request(bindingSchema, "/binding", "POST", {
      chat_id: chatId.trim(),
      mode: "interactive",
    }),
  setEnabled: (enabled: boolean) =>
    request(bindingSchema, "/binding", "PATCH", { enabled }),
  useInteractive: () =>
    request(bindingSchema, "/binding", "PATCH", { mode: "interactive" }),
};
