import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  rankRatingTags,
  ratingTargetKey,
  threadRatingsAPI,
} from "../src/lib/rl-feedback.ts";

const tag = (id, polarity, domain = "all", tool_groups = []) => ({
  id,
  label: id,
  description: "Reason for the rating",
  polarity,
  category: domain === "all" ? "universal" : "domain",
  domains: [domain],
  tool_groups,
});

const domains = [
  ["code_analyzer", "VSDA Code Analyzer Agent", "scm", "read_scm_file"],
  ["log_analyzer", "VSDA Log Analyzer Agent", "aspera", "aspera_discover"],
  ["jira", "VSDA Jira Agent", "jira", "search_jira_tickets"],
  ["polarion", "VSDA Polarion Agent", "polarion", "get_polarion_item"],
  ["planner", "VSDA Planner Agent", "planner", "list_planner_tasks"],
];

const catalog = [
  tag("accurate_evidence", "positive"),
  tag("missed_evidence", "negative"),
  ...domains.flatMap(([domain, , group]) => [
    tag(`accurate_${domain}`, "positive", domain, [group]),
    tag(`wrong_${domain}`, "negative", domain, [group]),
  ]),
];

test("Presents relevant domain and tool tags with polarity matching the score", () => {
  for (const [domain, graph, , tool] of domains) {
    for (const [context, tools] of [
      [graph, []],
      [`${domain}_agent`, []],
      ["VSDA Task Agent", [tool]],
      ["VSDA Deep Agent", ["task", `${domain}_agent`]],
    ]) {
      for (const score of [1, 2, 3, 4, 5]) {
        const positive = score >= 4;
        const { suggested, more } = rankRatingTags(
          catalog,
          { score, tags: [] },
          context,
          tools
        );
        assert.deepEqual(
          suggested.map(({ id }) => id),
          positive
            ? [
                `accurate_${domain}`,
                "accurate_evidence",
                `wrong_${domain}`,
                "missed_evidence",
              ]
            : [
                `wrong_${domain}`,
                "missed_evidence",
                `accurate_${domain}`,
                "accurate_evidence",
              ]
        );
        assert.equal(more.length, catalog.length - suggested.length);
      }
    }
  }
});

test("Caps initial suggestions while retaining tags already selected", () => {
  const full = [
    ...catalog,
    ...Array.from({ length: 9 }, (_, index) =>
      tag(`extra_${index}`, "negative")
    ),
  ];
  const { suggested, more } = rankRatingTags(
    full,
    { score: 2, tags: ["accurate_jira"] },
    "code_analyzer"
  );
  assert.equal(suggested.length, 8);
  assert(suggested.some(({ id }) => id === "accurate_jira"));
  assert(more.some(({ id }) => id === "wrong_jira"));
  assert.equal(suggested[0].id, "wrong_code_analyzer");
});

test("Rating keys match backend canonical SHA256 across thread and target scopes", () => {
  const threadId = "thread é";
  const targetId = 'message/"\\ 中文 😀';
  const expected = createHash("sha256")
    .update(
      JSON.stringify([
        "vsda-rl-feedback-target-v1",
        threadId,
        "agent_message",
        targetId,
      ])
    )
    .digest("hex");
  assert.equal(ratingTargetKey(threadId, "agent_message", targetId), expected);
  assert.notEqual(
    ratingTargetKey(threadId, "subagent_run", targetId),
    expected
  );
  assert.notEqual(
    ratingTargetKey("another thread", "agent_message", targetId),
    expected
  );
});

test("Owner API encodes raw IDs for writes and validates anonymized IDs on reads", async (t) => {
  const threadId = "thread one";
  const input = {
    target_type: "subagent_run",
    target_id: "task#1",
    score: 4,
    tags: ["accurate_jira"],
  };
  const saved = {
    ...input,
    target_id: ratingTargetKey(threadId, input.target_type, input.target_id),
    created_at: "2026-11-27T12:00:00Z",
    updated_at: "2026-11-27T12:00:00Z",
  };
  const responses = [
    Response.json({ enabled: true, tag_catalog: catalog, ratings: [saved] }),
    Response.json(saved),
    new Response(null, { status: 204 }),
    Response.json({ enabled: false, tag_catalog: [], ratings: [] }),
    Response.json({ enabled: true, tag_catalog: [], ratings: [input] }),
  ];
  const requests = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    requests.push([path, options.method ?? "GET", options.body]);
    return responses.shift();
  });

  assert.deepEqual((await threadRatingsAPI.list(threadId)).ratings, [saved]);
  assert.deepEqual(await threadRatingsAPI.save(threadId, input), saved);
  await threadRatingsAPI.clear(threadId, input.target_type, input.target_id);
  assert.equal((await threadRatingsAPI.list(threadId)).enabled, false);
  await assert.rejects(threadRatingsAPI.list(threadId), { name: "ZodError" });
  assert.deepEqual(requests.slice(0, 3), [
    ["/api/threads/thread%20one/ratings", "GET", undefined],
    ["/api/threads/thread%20one/ratings", "PUT", JSON.stringify(input)],
    [
      "/api/threads/thread%20one/ratings/subagent_run/task%231",
      "DELETE",
      undefined,
    ],
  ]);
});
