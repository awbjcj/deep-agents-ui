"use client";

import { useRef, useState } from "react";
import { apiFetch, getAuthUser } from "@/lib/auth";

type CredentialDraft = {
  service:
    | "graph_api_token"
    | "jira_api_token"
    | "confluence_api_token"
    | "polarion_asux_api_token"
    | "polarion_prod1_api_token"
    | "scm"
    | "copilot"
    | "aspera";
  secret: string;
  username?: string;
  github_host?: string;
  server_id?: string;
};

type SavedCredential = Pick<CredentialDraft, "service" | "server_id"> & {
  source: "saved";
};

export const credentialStatusLabels = {
  unverified: "Unverified",
  testing: "Testing…",
  verified: "Verified",
  failed: "Test failed",
} as const;

export type CredentialTestResult = {
  status: "testing" | "verified" | "failed";
  message?: string;
};

function storageKey(key: string) {
  const user = getAuthUser();
  return user ? `vsda:credential-verification:${user.user_id}:${key}` : null;
}

export function savedCredentialStatus(
  key: string,
  revision?: string | null,
  verified = false
) {
  if (verified) return credentialStatusLabels.verified;
  if (revision) {
    try {
      const item = storageKey(key);
      if (item && localStorage.getItem(item) === revision)
        return credentialStatusLabels.verified;
    } catch {
      // Verification can still be used during this visit if storage is blocked.
    }
  }
  return credentialStatusLabels.unverified;
}

export function useCredentialTests() {
  const [results, setResults] = useState<Record<string, CredentialTestResult>>(
    {}
  );
  const latest = useRef(
    new Map<string, { draft: string; result: CredentialTestResult }>()
  );
  async function test(
    key: string,
    draft: CredentialDraft | SavedCredential,
    revision?: string | null
  ) {
    if (latest.current.get(key)?.result.status === "testing") return;
    const item = storageKey(key);
    const signature = JSON.stringify(draft);
    const entry = {
      draft: signature,
      result: { status: "testing" } as CredentialTestResult,
    };
    latest.current.set(key, entry);
    setResults((current) => ({ ...current, [key]: entry.result }));
    let result: CredentialTestResult;
    try {
      const res = await apiFetch("/user/credential-tests", {
        method: "POST",
        body: signature,
        signal: AbortSignal.timeout(20_000),
      });
      const data: unknown = res.ok ? await res.json() : null;
      if (
        "source" in draft &&
        revision &&
        data &&
        typeof data === "object" &&
        "status" in data &&
        data.status === "verified" &&
        (!("revision" in data) || data.revision !== revision)
      ) {
        result = {
          status: "failed",
          message:
            "The saved credential changed. Reopen Token settings and try again.",
        };
      } else if (
        data &&
        typeof data === "object" &&
        "status" in data &&
        data.status === "verified"
      ) {
        result = { status: "verified" };
      } else {
        const message =
          data &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "Could not complete the connection test. Try again.";
        result = { status: "failed", message };
      }
    } catch {
      result = {
        status: "failed",
        message: "Could not complete the connection test. Try again.",
      };
    }
    if (latest.current.get(key) !== entry || storageKey(key) !== item) return;
    if ("source" in draft && result.status === "verified" && revision && item) {
      try {
        localStorage.setItem(item, revision);
      } catch {
        // The current result still displays if browser storage is unavailable.
      }
    }
    entry.result = result;
    setResults((current) => ({ ...current, [key]: result }));
  }

  function clear(key: string) {
    latest.current.delete(key);
    setResults((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function record(
    key: string,
    draft: CredentialDraft | null,
    revision?: string | null
  ) {
    const entry = latest.current.get(key);
    const verified =
      draft &&
      entry?.result.status === "verified" &&
      entry.draft === JSON.stringify(draft);
    clear(key);
    try {
      const item = storageKey(key);
      if (item && verified && revision) localStorage.setItem(item, revision);
      else if (item) localStorage.removeItem(item);
    } catch {
      // Browser storage is optional.
    }
  }

  function testSaved(
    key: string,
    target: Omit<SavedCredential, "source">,
    revision?: string | null
  ) {
    return test(key, { ...target, source: "saved" }, revision);
  }

  const isTesting = Object.values(results).some(
    (result) => result.status === "testing"
  );
  return { results, test, testSaved, isTesting, clear, record };
}
