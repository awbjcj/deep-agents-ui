"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/auth";

const endpoint = "/user/aspera/credentials";

interface AsperaCredentialView {
  configured: boolean;
  username?: string | null;
}

type CredentialAction = "PUT" | "DELETE";
const actionText = {
  PUT: {
    pending: "Saving Aspera login…",
    complete: "Aspera credentials saved",
  },
  DELETE: {
    pending: "Removing Aspera login…",
    complete: "Aspera credentials removed",
  },
};

/** Manage the Aspera login used to discover and download MAT recordings. */
export function AsperaCredentials() {
  const [credential, setCredential] = useState<AsperaCredentialView | null>(
    null
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<CredentialAction | null>(null);
  const [completed, setCompleted] = useState<CredentialAction | null>(null);
  const [updateError, setUpdateError] = useState("");
  const usernameInput = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useSettingsDraft(
    pending !== null ||
      Boolean(password) ||
      username !== (credential?.username ?? "")
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(endpoint, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not load Aspera settings");
        const saved: AsperaCredentialView = await response.json();
        if (controller.signal.aborted) return;
        setCredential(saved);
        setUsername(saved.username ?? "");
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    })();
    return () => controller.abort();
  }, [loadAttempt]);

  useEffect(() => {
    if (completed === "DELETE") usernameInput.current?.focus();
  }, [completed]);

  async function update(method: CredentialAction) {
    setPending(method);
    setCompleted(null);
    setUpdateError("");
    try {
      const response = await apiFetch(endpoint, {
        method,
        ...(method === "PUT"
          ? { body: JSON.stringify({ username: username.trim(), password }) }
          : {}),
      });
      if (!response.ok) {
        if (response.status === 503) {
          setUpdateError(
            "Credential storage is unavailable. Ask an administrator to check the server configuration."
          );
          return;
        }
        if (method === "PUT" && [413, 422].includes(response.status)) {
          setUpdateError(
            "Check the username and password. The password can contain up to 8,192 UTF-8 bytes."
          );
          return;
        }
        throw new Error();
      }
      const saved: AsperaCredentialView = await response.json();
      setCredential(saved);
      setUsername(saved.username ?? "");
      setPassword("");
      setCompleted(method);
    } catch {
      setUpdateError(
        method === "PUT"
          ? "Could not save Aspera credentials"
          : "Could not remove Aspera credentials"
      );
    } finally {
      setPending(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending && username.trim() && password) void update("PUT");
  }

  let status = credential?.configured
    ? "Your Aspera login is saved. Enter a password to replace it."
    : "Save your Aspera login to find and download logs.";
  if (completed) status = actionText[completed].complete;
  if (pending) status = actionText[pending].pending;

  return (
    <section
      aria-labelledby="aspera-credentials-title"
      className="border-border @container/aspera space-y-3 border-t pt-4"
    >
      <h3
        id="aspera-credentials-title"
        className="text-sm font-medium"
      >
        Aspera
      </h3>
      {credential ? (
        <form onSubmit={save}>
          <fieldset
            disabled={pending !== null}
            className="min-w-0 space-y-3"
          >
            <p
              role="status"
              className="text-muted-foreground text-xs"
            >
              {status}
            </p>
            <div className="grid gap-3 @md/aspera:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="aspera-username">Aspera username</Label>
                <Input
                  id="aspera-username"
                  ref={usernameInput}
                  className="border-muted-foreground/70"
                  autoComplete="section-aspera username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setCompleted(null);
                    setUpdateError("");
                  }}
                  required
                  maxLength={200}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="aspera-password">Aspera password</Label>
                <Input
                  id="aspera-password"
                  className="border-muted-foreground/70"
                  type="password"
                  autoComplete="section-aspera current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setCompleted(null);
                    setUpdateError("");
                  }}
                  required
                  maxLength={8192}
                />
              </div>
            </div>
            {updateError && (
              <p
                role="alert"
                className="text-destructive text-sm"
              >
                {updateError}
              </p>
            )}
            <div className="grid gap-2 @sm/aspera:flex @sm/aspera:flex-wrap">
              <Button
                type="submit"
                variant="default"
                disabled={!username.trim() || !password}
                className="min-h-touch"
              >
                Save Aspera login
              </Button>
              {credential.configured && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void update("DELETE")}
                  className="min-h-touch"
                >
                  Remove Aspera login
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      ) : loadError ? (
        <div
          role="alert"
          className="space-y-2 text-sm"
        >
          <p>Could not load Aspera settings.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoadError(false);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <p
          role="status"
          className="text-muted-foreground text-xs"
        >
          Loading Aspera settings…
        </p>
      )}
    </section>
  );
}
