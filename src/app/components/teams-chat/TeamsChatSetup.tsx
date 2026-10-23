"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { teamsChatAPI, type TeamsChatPage } from "@/lib/teams-chat";

export function TeamsChatSetup({
  busy,
  connecting,
  onConnect,
}: {
  busy: boolean;
  connecting: boolean;
  onConnect: (chatId: string) => void;
}) {
  const [chatId, setChatId] = useState("");
  const [chats, setChats] = useState<TeamsChatPage["chats"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function discover(cursor?: string) {
    if (request.current || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setError("");
    try {
      const page = await teamsChatAPI.chats(cursor, controller.signal);
      if (controller.signal.aborted) return;
      const candidates = page.chats.filter((chat) => chat.self_chat_candidate);
      const combined = Array.from(
        new Map(
          [...(cursor ? chats : []), ...candidates].map((chat) => [
            chat.id,
            chat,
          ])
        ).values()
      );
      setChats(combined);
      setNextCursor(page.next_cursor);
      setSearched(true);
      if (combined.length === 1) setChatId(combined[0].id);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not find your self-chat. Try again."
        );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (chatId.trim() && !busy && !searching) onConnect(chatId);
      }}
      className="space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Connect your self-chat</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Use your private chat with yourself in Teams. Your saved Microsoft
          Graph token is used to find and verify it.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full"
        disabled={busy || searching}
        onClick={() => void discover()}
      >
        {searching ? (
          <Loader2
            aria-hidden="true"
            className="motion-safe:animate-spin"
          />
        ) : (
          <Search aria-hidden="true" />
        )}
        {searching ? "Finding your chat…" : "Find my self-chat"}
      </Button>
      {error && (
        <p
          role="alert"
          className="break-words text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {chats.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="teams-self-chat">Your self-chat</Label>
          <select
            id="teams-self-chat"
            value={chats.some((chat) => chat.id === chatId) ? chatId : ""}
            onChange={(event) => setChatId(event.target.value)}
            disabled={busy || searching}
            className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">Choose a chat</option>
            {chats.map((chat) => (
              <option
                key={chat.id}
                value={chat.id}
              >
                {chat.topic || "Chat with yourself"} · {chat.id.slice(-14)}
              </option>
            ))}
          </select>
        </div>
      )}
      {searched && chats.length === 0 && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          No self-chat found{" "}
          {nextCursor
            ? "on this page. Check the next page or enter its chat ID below."
            : "yet. Open your self-chat in Teams, then try again or enter its chat ID below."}
        </p>
      )}
      {nextCursor && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={busy || searching}
          onClick={() => void discover(nextCursor)}
        >
          Check more chats
        </Button>
      )}
      <details className="rounded-md border border-border px-3">
        <summary className="cursor-pointer py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          Enter a chat ID instead
        </summary>
        <div className="space-y-2 pb-3">
          <Label htmlFor="teams-chat-id">Self-chat ID</Label>
          <Input
            id="teams-chat-id"
            value={chatId}
            maxLength={1024}
            onChange={(event) => setChatId(event.target.value)}
            disabled={busy || searching}
            placeholder="Paste your Teams self-chat ID"
            aria-describedby="teams-chat-id-hint"
            className="min-h-11"
          />
          <p
            id="teams-chat-id-hint"
            className="text-xs leading-relaxed text-muted-foreground"
          >
            Only a private chat belonging to your Graph account can be
            connected. Group chats are not supported.
          </p>
        </div>
      </details>
      <p
        id="teams-connect-consent"
        className="text-sm leading-relaxed text-muted-foreground"
      >
        Connecting enables the feature and sends a setup message to this chat.
        Only messages starting with{" "}
        <code className="rounded bg-muted px-1 font-mono text-foreground">
          /agent
        </code>{" "}
        are handled.
      </p>
      <Button
        type="submit"
        className="min-h-11 w-full"
        disabled={busy || searching || !chatId.trim()}
        aria-describedby="teams-connect-consent"
      >
        {connecting && (
          <Loader2
            aria-hidden="true"
            className="motion-safe:animate-spin"
          />
        )}
        {connecting ? "Connecting…" : "Connect and enable"}
      </Button>
    </form>
  );
}
