import { useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { Thread, Client } from "@langchain/langgraph-sdk";
import { useClient } from "@/providers/ClientProvider";
import { getConfig } from "@/lib/config";

export interface ThreadItem {
  id: string;
  updatedAt: Date;
  status: Thread["status"];
  title: string;
  description: string;
  /** True once the server or the user has named the thread. */
  titled: boolean;
  assistantId?: string;
}

const DEFAULT_PAGE_SIZE = 20;

const FALLBACK_TITLE_CHARS = 100;
// The server names a conversation in the background after its first run
// finishes (at most ~10 s), so recently finished untitled threads are
// re-fetched a few times to pick the title up without a manual refresh.
const TITLE_RECHECK_MS = 4000;
const TITLE_RECHECK_LIMIT = 3;
const TITLE_RECHECK_WINDOW_MS = 2 * 60 * 1000;

export function deriveMeta(thread: Thread): {
  title: string;
  description: string;
  titled: boolean;
} {
  let title = "Untitled Thread";
  let description = "";

  try {
    const values = thread.values as {
      messages?: Array<{ type?: string; content?: unknown }>;
    };
    const preview = thread.extracted;
    const messages = values?.messages ?? [
      { type: preview?.firstType, content: preview?.firstContent },
      { type: preview?.secondType, content: preview?.secondContent },
    ];
    const firstHuman = messages.find((m) => m?.type === "human");
    if (firstHuman?.content) {
      const content =
        typeof firstHuman.content === "string"
          ? firstHuman.content
          : (firstHuman.content as Array<{ text?: string }>)[0]?.text || "";
      const normalized = content.replace(/\s+/g, " ").trim();
      if (normalized.length <= FALLBACK_TITLE_CHARS) {
        title = normalized || title;
      } else {
        const prefix = normalized.slice(0, FALLBACK_TITLE_CHARS);
        const cut = prefix.lastIndexOf(" ");
        title =
          normalized[FALLBACK_TITLE_CHARS] === " " || cut <= 0
            ? prefix
            : prefix.slice(0, cut);
      }
    }
    const firstAi = messages.find((m) => m?.type === "ai");
    if (firstAi?.content) {
      const content =
        typeof firstAi.content === "string"
          ? firstAi.content
          : (firstAi.content as Array<{ text?: string }>)[0]?.text || "";
      description = content.slice(0, 100);
    }
  } catch {
    title = `Thread ${thread.thread_id.slice(0, 8)}`;
  }

  return { title, description, titled };
}

/** Fetch sidebar fields and preserve previews for unconventional message orders. */
export async function searchThreadSummaries(
  client: Client,
  query: NonNullable<Parameters<Client["threads"]["search"]>[0]>
): Promise<Thread[]> {
  const rows = await client.threads.search({
    ...query,
    select: ["thread_id", "metadata", "updated_at", "status"],
    extract: {
      firstType: "values.messages[0].type",
      firstContent: "values.messages[0].content",
      secondType: "values.messages[1].type",
      secondContent: "values.messages[1].content",
    },
  });
  const unusual = rows.filter(
    ({ extracted, values }) =>
      !values &&
      (!extracted ||
        (extracted?.firstType != null && extracted.firstType !== "human") ||
        (extracted?.secondType != null && extracted.secondType !== "ai"))
  );
  if (!unusual.length) return rows;
  const fullRows = await client.threads.search({
    metadata: query.metadata,
    ids: unusual.map((row) => row.thread_id),
    limit: unusual.length,
    select: ["thread_id", "values"],
  });
  const valuesById = new Map(
    fullRows.map((row) => [row.thread_id, row.values])
  );
  return rows.map((row) => ({
    ...row,
    values: valuesById.get(row.thread_id) ?? row.values,
  }));
}

/** Return recently finished, untitled threads whose title may still arrive. */
export function threadsAwaitingTitle(
  threads: ThreadItem[],
  rechecks: ReadonlyMap<string, number>,
  now = Date.now()
): ThreadItem[] {
  return threads.filter(
    (thread) =>
      !thread.titled &&
      thread.status === "idle" &&
      now - thread.updatedAt.getTime() < TITLE_RECHECK_WINDOW_MS &&
      (rechecks.get(thread.id) ?? 0) < TITLE_RECHECK_LIMIT
  );
}

/** Recheck titles even when an equal SWR response does not rerun the effect. */
export function scheduleTitleRechecks(
  firstPage: ThreadItem[],
  rechecks: Map<string, number>,
  revalidate: () => Promise<ThreadItem[][] | undefined>
): () => void {
  let page = firstPage;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (cancelled || threadsAwaitingTitle(page, rechecks).length === 0) return;
    timer = setTimeout(async () => {
      const waiting = threadsAwaitingTitle(page, rechecks);
      if (cancelled || waiting.length === 0) return;
      for (const thread of waiting) {
        rechecks.set(thread.id, (rechecks.get(thread.id) ?? 0) + 1);
      }
      try {
        const updated = await revalidate();
        if (updated?.[0]) page = updated[0];
      } catch {
        // A transient failure still consumes an attempt, but not the remainder.
      }
      schedule();
    }, TITLE_RECHECK_MS);
  }

  schedule();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

export function useThreads(props: {
  status?: Thread["status"];
  limit?: number;
  userId?: string;
}) {
  const pageSize = props.limit || DEFAULT_PAGE_SIZE;
  // Reuse the singleton Client from ClientProvider so future header changes
  // (auth bearer, etc.) only need to be made in one place.
  const client: Client = useClient();

  const threads = useSWRInfinite(
    (pageIndex: number, previousPageData: ThreadItem[] | null) => {
      const config = getConfig();
      if (!config) return null;
      if (previousPageData && previousPageData.length === 0) return null;

      return {
        kind: "threads" as const,
        pageIndex,
        pageSize,
        assistantId: config.assistantId,
        status: props?.status,
        userId: props?.userId,
      };
    },
    async ({
      assistantId,
      status,
      pageIndex,
      pageSize,
      userId,
    }: {
      kind: "threads";
      pageIndex: number;
      pageSize: number;
      assistantId: string;
      status?: Thread["status"];
      userId?: string;
    }) => {
      const metadata: Record<string, string> = {};
      if (userId) metadata.user_id = userId;

      const threads = await searchThreadSummaries(client, {
        limit: pageSize,
        offset: pageIndex * pageSize,
        sortBy: "updated_at" as const,
        sortOrder: "desc" as const,
        status,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      });

      return threads.map((thread): ThreadItem => {
        const meta = deriveMeta(thread);
        return {
          id: thread.thread_id,
          updatedAt: new Date(thread.updated_at),
          status: thread.status,
          title: meta.title,
          description: meta.description,
          titled: meta.titled,
          assistantId,
        };
      });
    },
    {
      // Revalidate only the first page on focus: the user almost never wants
      // pages 2+ refreshed automatically (they scrolled back in time to read
      // them) and re-fetching them wastes a lot of bandwidth.
      revalidateFirstPage: true,
      revalidateAll: false,
      revalidateOnFocus: true,
    }
  );

  const { data, mutate } = threads;
  const titleRechecks = useRef(new Map<string, number>());
  useEffect(
    () => scheduleTitleRechecks(data?.[0] ?? [], titleRechecks.current, mutate),
    [data, mutate]
  );

  return threads;
}
