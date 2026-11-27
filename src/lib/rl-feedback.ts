import { sha256 } from "js-sha256";
import { z } from "zod";
import { apiFetch, extractErrorMessage } from "@/lib/auth";

export const targetTypeSchema = z.enum(["agent_message", "subagent_run"]);
export const scoreSchema = z.int().min(1).max(5);
export const tagSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  polarity: z.enum(["positive", "negative"]),
  category: z.enum([
    "universal",
    "orchestration",
    "grounding_safety",
    "domain",
  ]),
  domains: z.array(z.string()),
  tool_groups: z.array(z.string()),
});

const ratingInputSchema = z.object({
  target_type: targetTypeSchema,
  target_id: z.string().min(1).max(512),
  score: scoreSchema,
  tags: z.array(z.string()).max(5),
});
const ratingSchema = ratingInputSchema.extend({
  target_id: z.string().regex(/^[\da-f]{64}$/),
  created_at: z.string(),
  updated_at: z.string(),
});
const threadRatingsSchema = z.object({
  enabled: z.boolean(),
  tag_catalog: z.array(tagSchema),
  ratings: z.array(ratingSchema),
});

export type RatingTag = z.infer<typeof tagSchema>;
export type RatingTargetType = z.infer<typeof targetTypeSchema>;
export type RatingInput = z.infer<typeof ratingInputSchema>;
export type ThreadRating = z.infer<typeof ratingSchema>;
export type RatingSelection = Pick<RatingInput, "score" | "tags">;

export class RatingCollectionDisabled extends Error {}

async function checkResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const data = await response.json().catch(() => null);
  if (
    response.status === 403 &&
    data?.detail === "Thread rating collection is disabled"
  ) {
    throw new RatingCollectionDisabled(data.detail);
  }
  throw new Error(
    extractErrorMessage(data?.detail, "Could not save feedback.")
  );
}

const ratingsPath = (threadId: string) =>
  `/threads/${encodeURIComponent(threadId)}/ratings`;

export const threadRatingsAPI = {
  async list(threadId: string, signal?: AbortSignal) {
    const response = await checkResponse(
      await apiFetch(ratingsPath(threadId), { cache: "no-store", signal })
    );
    return threadRatingsSchema.parse(await response.json());
  },
  async save(threadId: string, input: RatingInput) {
    const response = await checkResponse(
      await apiFetch(ratingsPath(threadId), {
        method: "PUT",
        body: JSON.stringify(ratingInputSchema.parse(input)),
      })
    );
    return ratingSchema.parse(await response.json());
  },
  async clear(
    threadId: string,
    targetType: RatingTargetType,
    targetId: string
  ) {
    await checkResponse(
      await apiFetch(
        `${ratingsPath(threadId)}/${targetType}/${encodeURIComponent(targetId)}`,
        { method: "DELETE" }
      )
    );
  },
};

/** Match the anonymized identifier returned by the authenticated ratings API. */
export function ratingTargetKey(
  threadId: string,
  targetType: RatingTargetType,
  targetId: string
): string {
  return sha256(
    JSON.stringify([
      "vsda-rl-feedback-target-v1",
      threadId,
      targetType,
      targetId,
    ])
  );
}

function normalize(value = ""): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

function ratingDomain(value?: string): string {
  const domain = normalize(value).replace(/^vsda_/, "");
  switch (domain) {
    case "deep_agent":
      return "supervisor";
    case "task_agent":
      return domain;
    case "email_agent":
      return "outlook";
    case "database_agent":
      return "knowledge_base";
    default:
      return domain.replace(/_agent$/, "");
  }
}

export function rankRatingTags(
  catalog: readonly RatingTag[],
  rating: RatingSelection,
  domain?: string,
  toolNames: readonly string[] = []
) {
  const selected = new Set(rating.tags);
  const preferred = rating.score >= 4 ? "positive" : "negative";
  const tools = toolNames.map((tool) => `_${normalize(tool)}_`);
  const toolDomains = new Set(toolNames.map(ratingDomain));
  const domainName = ratingDomain(domain);

  const ranked = catalog
    .map((tag) => {
      const contextual =
        tag.domains.includes(domainName) ||
        tag.domains.some((candidate) => toolDomains.has(candidate)) ||
        tag.tool_groups.some((group) =>
          tools.some((tool) => tool.includes(`_${normalize(group)}_`))
        );
      return {
        tag,
        relevant:
          contextual ||
          tag.category !== "domain" ||
          tag.domains.includes("all"),
        contextual,
      };
    })
    .sort(
      (a, b) =>
        Number(b.relevant) - Number(a.relevant) ||
        Number(b.tag.polarity === preferred) -
          Number(a.tag.polarity === preferred) ||
        Number(b.contextual) - Number(a.contextual)
    );

  const suggestions = new Set(
    ranked.filter(({ tag }) => selected.has(tag.id)).map(({ tag }) => tag.id)
  );
  for (const { tag, relevant } of ranked) {
    if (suggestions.size >= 8 || !relevant) break;
    suggestions.add(tag.id);
  }
  return {
    all: ranked.map(({ tag }) => tag),
    suggested: ranked
      .filter(({ tag }) => suggestions.has(tag.id))
      .map(({ tag }) => tag),
    more: ranked
      .filter(({ tag }) => !suggestions.has(tag.id))
      .map(({ tag }) => tag),
  };
}
