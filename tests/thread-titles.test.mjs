import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMeta,
  scheduleTitleRechecks,
  searchThreadSummaries,
  threadsAwaitingTitle,
} from "../src/app/hooks/useThreads.ts";

function thread(metadata, content) {
  return {
    thread_id: crypto.randomUUID(),
    updated_at: "2026-01-01T00:00:00Z",
    metadata,
    values: { messages: [{ type: "human", content }] },
  };
}

test("generated titles display in full and manual titles take precedence", () => {
  const generated =
    "Investigate the brake warning indicator in release validation logs";
  assert.equal(
    deriveMeta(thread({ title: generated }, "prompt")).title,
    generated
  );
  assert.equal(
    deriveMeta(
      thread({ title: generated, custom_name: "My investigation" }, "prompt")
    ).title,
    "My investigation"
  );
});

test("fallback titles do not append ellipses or cut words", () => {
  const prompt =
    "Investigate the brake warning indicator and compare vehicle logs across the release validation recordings";
  const title = deriveMeta(thread({}, prompt)).title;
  assert.ok(title.length > 50);
  assert.ok(prompt.startsWith(title));
  assert.ok(!title.endsWith("..."));
  assert.ok(title.length === prompt.length || prompt[title.length] === " ");
});

test("fallback titles keep whole prefixes without spaces or at word ends", () => {
  const cjk = "分析".repeat(60);
  assert.equal(deriveMeta(thread({}, cjk)).title, cjk.slice(0, 100));
  const wordEnd = `${"a".repeat(50)} ${"b".repeat(49)} tail`;
  assert.equal(deriveMeta(thread({}, wordEnd)).title, wordEnd.slice(0, 100));
});

test("only recent idle untitled threads are rechecked, a bounded number of times", () => {
  const now = Date.parse("2026-01-01T00:01:00Z");
  const item = (id, overrides = {}) => ({
    id,
    updatedAt: new Date("2026-01-01T00:00:50Z"),
    status: "idle",
    title: id,
    description: "",
    titled: false,
    ...overrides,
  });
  const threads = [
    item("waiting"),
    item("named", { titled: true }),
    item("running", { status: "busy" }),
    item("old", { updatedAt: new Date("2025-12-31T00:00:00Z") }),
    item("exhausted"),
  ];
  const rechecks = new Map([
    ["exhausted", { updatedAt: threads[4].updatedAt.getTime(), attempts: 3 }],
  ]);
  assert.deepEqual(
    threadsAwaitingTitle(threads, rechecks, now).map((thread) => thread.id),
    ["waiting"]
  );
});

test("a generated or manual title overrides a cached fallback at the same timestamp", () => {
  const original = thread({}, "Fallback");
  assert.equal(deriveMeta(original).title, "Fallback");
  const named = { ...original, metadata: { title: "Generated" } };
  assert.equal(deriveMeta(named).title, "Generated");
  assert.equal(
    deriveMeta({
      ...named,
      metadata: { ...named.metadata, custom_name: "Manual" },
    }).title,
    "Manual"
  );
});

function pendingTitle(id = "thread") {
  return {
    id,
    updatedAt: new Date(Date.now()),
    status: "idle",
    title: "Fallback",
    description: "",
    titled: false,
  };
}

test("title checks continue after an equal SWR response and stop when named", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  const item = pendingTitle();
  let page = [item];
  const calls = [];
  const rechecks = new Map();
  const cancel = scheduleTitleRechecks(page, rechecks, async () => {
    calls.push(Date.now());
    if (calls.length === 2) {
      page = [{ ...item, title: "Generated", titled: true }];
    }
    // First result is deep-equal: SWR does not update data or rerun the effect.
    return [page.map((row) => ({ ...row }))];
  });

  t.mock.timers.tick(4000);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(4000);
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[1] - calls[0], 4000);
  assert.equal(page[0].title, "Generated");
  t.mock.timers.tick(20_000);
  assert.equal(calls.length, 2);
  cancel();
});

test("title retries are bounded, resilient to rejection, and cancel when disposed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  const item = pendingTitle();
  let calls = 0;
  const cancel = scheduleTitleRechecks([item], new Map(), async () => {
    calls += 1;
    if (calls === 1) throw Error("temporary failure");
  });
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(4000);
    await Promise.resolve();
  }
  assert.equal(calls, 3);
  cancel();

  let finish;
  const dispose = scheduleTitleRechecks([item], new Map(), () => {
    calls += 1;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  t.mock.timers.tick(4000);
  t.mock.timers.tick(8000);
  assert.equal(calls, 4, "never overlap a pending revalidation");
  dispose();
  finish();
  await Promise.resolve();
  t.mock.timers.tick(12_000);
  assert.equal(calls, 4, "never reschedule after disposal");
});

test("title retries reevaluate the original two-minute eligibility window", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  const item = pendingTitle();
  item.updatedAt = new Date(Date.now() - 119_000);
  let calls = 0;
  const cancel = scheduleTitleRechecks([item], new Map(), async () => {
    calls += 1;
  });
  t.mock.timers.tick(4000);
  assert.equal(calls, 0);
  cancel();
});

test("a thread gets fresh title retries after its first run updates the empty draft", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  const draft = pendingTitle();
  const rechecks = new Map();
  let calls = 0;
  const revalidate = async () => {
    calls += 1;
  };
  const stopDraft = scheduleTitleRechecks([draft], rechecks, revalidate);
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(4000);
    await Promise.resolve();
  }
  assert.equal(calls, 3);
  stopDraft();

  t.mock.timers.tick(60_000);
  const finished = { ...draft, updatedAt: new Date(Date.now()) };
  const stopRun = scheduleTitleRechecks([finished], rechecks, revalidate);
  t.mock.timers.tick(4000);
  await Promise.resolve();
  assert.equal(calls, 4, "a newly finished run must not inherit draft retries");
  stopRun();
});

test("sidebar projects previews and fetches unusual histories in one scoped batch", async () => {
  const regular = {
    thread_id: "regular",
    extracted: {
      firstType: "human",
      firstContent: "Request",
      secondType: "ai",
      secondContent: "Answer",
    },
  };
  const legacy = {
    thread_id: "legacy",
    extracted: { firstType: "system", secondType: "human" },
  };
  const metadata = { user_id: "owner" };
  const queries = [];
  const client = {
    threads: {
      async search(query) {
        queries.push(query);
        if (!query.ids) return [regular, legacy];
        return [
          {
            thread_id: "legacy",
            values: {
              messages: [
                { type: "system" },
                { type: "human", content: "Later prompt" },
                { type: "ai", content: "Later answer" },
              ],
            },
          },
        ];
      },
    },
  };
  const [first, second] = await searchThreadSummaries(client, {
    metadata,
    offset: 20,
    limit: 20,
  });
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].select, [
    "thread_id",
    "metadata",
    "updated_at",
    "status",
  ]);
  assert.equal(queries[0].extract.firstContent, "values.messages[0].content");
  assert.deepEqual(queries[1], {
    metadata,
    ids: ["legacy"],
    limit: 1,
    select: ["thread_id", "values"],
  });
  assert.deepEqual(deriveMeta(first), {
    title: "Request",
    description: "Answer",
    titled: false,
  });
  assert.deepEqual(deriveMeta(second), {
    title: "Later prompt",
    description: "Later answer",
    titled: false,
  });
});
