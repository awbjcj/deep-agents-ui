"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { teamsChatAPI } from "@/lib/teams-chat";

export function TeamsChatSetup({
  busy,
  connecting,
  reconnecting = false,
  onConnect,
}: {
  busy: boolean;
  connecting: boolean;
  reconnecting?: boolean;
  onConnect: (chatId: string) => void;
}) {
  const [chatId, setChatId] = useState("");
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function discover() {
    if (request.current || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setError("");
    setChatId("");
    try {
      const page = await teamsChatAPI.chats(controller.signal);
      if (controller.signal.aborted) return;
      const notes = page.chats.find(
        (chat) => chat.id === "48:notes" && chat.self_chat_candidate
      );
      setChatId(notes?.id ?? "");
      setSearched(true);
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
        <h3 className="text-sm font-semibold">
          {reconnecting ? "Reconnect your self-chat" : "Connect your self-chat"}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Use your private chat with yourself in Teams. Your saved Microsoft
          Graph token is used to find and verify it.
        </p>
        {reconnecting && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your previous connection is no longer available. Reconnecting starts
            a new conversation and handles only new commands. Previous requests
            and replies will not be replayed. Any task already running can still
            be managed in the previous web conversation.
          </p>
        )}
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
      {chatId && (
        <p
          role="status"
          className="text-sm"
        >
          Your personal self-chat is ready to connect.
        </p>
      )}
      {searched && !searching && !chatId && !error && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          No personal self-chat found. Open your chat with yourself in Teams,
          then try again.
        </p>
      )}
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
        {connecting
          ? "Connecting…"
          : reconnecting
          ? "Reconnect and enable"
          : "Connect and enable"}
      </Button>
    </form>
  );
}
