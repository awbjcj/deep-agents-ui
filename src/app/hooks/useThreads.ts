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
  assistantId?: string;
}

const DEFAULT_PAGE_SIZE = 20;

// Title/description derivation is expensive (walks message history) and stable
// for a given thread until `updated_at` changes. Cache by `${id}::${updatedAt}`
// so SWR focus revalidations don't repeatedly re-parse the same payloads.
const derivationCache = new Map<
  string,
  { title: string; description: string }
>();
const CACHE_LIMIT = 500;

function deriveMeta(thread: Thread): { title: string; description: string } {
  const key = `${thread.thread_id}::${thread.updated_at}`;
  const hit = derivationCache.get(key);
  if (hit) return hit;

  let title = "Untitled Thread";
  let description = "";

  try {
    if (thread.values && typeof thread.values === "object") {
      const values = thread.values as { messages?: Array<{ type?: string; content?: unknown }> };
      const messages = values.messages ?? [];
      const firstHuman = messages.find((m) => m?.type === "human");
      if (firstHuman?.content) {
        const content =
          typeof firstHuman.content === "string"
            ? firstHuman.content
            : (firstHuman.content as Array<{ text?: string }>)[0]?.text || "";
        title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      }
      const firstAi = messages.find((m) => m?.type === "ai");
      if (firstAi?.content) {
        const content =
          typeof firstAi.content === "string"
            ? firstAi.content
            : (firstAi.content as Array<{ text?: string }>)[0]?.text || "";
        description = content.slice(0, 100);
      }
    }
  } catch {
    title = `Thread ${thread.thread_id.slice(0, 8)}`;
  }

  const customName = (thread.metadata as Record<string, unknown>)?.custom_name;
  if (typeof customName === "string" && customName) {
    title = customName;
  }

  const result = { title, description };
  if (derivationCache.size >= CACHE_LIMIT) {
    // Evict oldest entry — Map preserves insertion order.
    const oldest = derivationCache.keys().next().value;
    if (oldest) derivationCache.delete(oldest);
  }
  derivationCache.set(key, result);
  return result;
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

  return useSWRInfinite(
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

      const threads = await client.threads.search({
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
    },
  );
}
