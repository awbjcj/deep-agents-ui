import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  agentAccessFlags,
  agentAccessKnown,
  allowedAssistantId,
  allowedAssistants,
  canUseAgent,
  canUseCodeAnalyzer,
  canUseTaskAgent,
  CODE_ANALYZER_AGENT_ID,
  isRestrictedAgent,
  RESTRICTED_AGENT_IDS,
  TASK_AGENT_ID,
} from "../src/lib/agent-access.ts";
import { DEFAULT_ASSISTANT_ID } from "../src/lib/chat-links.ts";

const account = (role, task, code) => ({
  role,
  can_use_task_agent: task,
  can_use_code_analyzer: code,
});

test("restricted agents require a privileged role and the matching profile flag", () => {
  assert.deepEqual(
    [...RESTRICTED_AGENT_IDS].sort(),
    [CODE_ANALYZER_AGENT_ID, TASK_AGENT_ID].sort()
  );
  for (const role of ["admin", "developer"]) {
    const enrolled = account(role, true, true);
    assert.equal(canUseTaskAgent(enrolled), true);
    assert.equal(canUseCodeAnalyzer(enrolled), true);
    const notEnrolled = account(role, false, true);
    assert.equal(canUseAgent(TASK_AGENT_ID, notEnrolled), false);
    assert.equal(canUseAgent(CODE_ANALYZER_AGENT_ID, notEnrolled), true);
  }
  // A stale or forged flag on an ordinary account never grants access.
  for (const access of [
    account("user", true, true),
    account("user", false, false),
    { role: "developer" },
    { role: "admin", can_use_task_agent: null, can_use_code_analyzer: null },
    null,
    undefined,
  ]) {
    assert.equal(canUseAgent(TASK_AGENT_ID, access), false);
    assert.equal(canUseAgent(CODE_ANALYZER_AGENT_ID, access), false);
    for (const graph of [
      DEFAULT_ASSISTANT_ID,
      "VSDA Jira Agent",
      "VSDA Database Agent",
      "custom-graph",
      "",
      undefined,
    ])
      assert.equal(canUseAgent(graph, access), true, String(graph));
  }
});

test("disallowed selections fall back to the default supervisor", () => {
  const user = account("user", false, false);
  const developer = account("developer", true, true);
  assert.equal(allowedAssistantId(TASK_AGENT_ID, user), DEFAULT_ASSISTANT_ID);
  assert.equal(
    allowedAssistantId(CODE_ANALYZER_AGENT_ID, user),
    DEFAULT_ASSISTANT_ID
  );
  assert.equal(allowedAssistantId(TASK_AGENT_ID, developer), TASK_AGENT_ID);
  assert.equal(
    allowedAssistantId("VSDA Database Agent", user),
    "VSDA Knowledge Base Agent"
  );
  const uuid = "bc4c5e77-6744-4270-9183-885d536cf339";
  assert.equal(allowedAssistantId(uuid, user), uuid);
  assert.equal(isRestrictedAgent(TASK_AGENT_ID), true);
  assert.equal(isRestrictedAgent(DEFAULT_ASSISTANT_ID), false);
  assert.equal(isRestrictedAgent(undefined), false);
});

test("assistant lists keep order and drop only graphs the account may not use", () => {
  const options = [
    { id: "a", graphId: DEFAULT_ASSISTANT_ID },
    { id: "b", graphId: TASK_AGENT_ID },
    { id: "c", graphId: "VSDA Jira Agent" },
    { id: "d", graphId: CODE_ANALYZER_AGENT_ID },
    { id: "e", graphId: CODE_ANALYZER_AGENT_ID },
  ];
  const ids = (access) => allowedAssistants(options, access).map((o) => o.id);
  assert.deepEqual(ids(account("user", false, false)), ["a", "c"]);
  assert.deepEqual(ids(account("developer", false, true)), [
    "a",
    "c",
    "d",
    "e",
  ]);
  assert.deepEqual(ids(account("admin", true, true)), [
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
});

test("profile flags default to false and are known only once recorded", () => {
  assert.deepEqual(agentAccessFlags({}), {
    can_use_task_agent: false,
    can_use_code_analyzer: false,
  });
  assert.deepEqual(
    agentAccessFlags({ can_use_task_agent: "true", can_use_code_analyzer: 1 }),
    { can_use_task_agent: false, can_use_code_analyzer: false }
  );
  assert.deepEqual(
    agentAccessFlags({ can_use_task_agent: true, can_use_code_analyzer: true }),
    { can_use_task_agent: true, can_use_code_analyzer: true }
  );
  assert.equal(agentAccessKnown({ role: "developer" }), false);
  assert.equal(agentAccessKnown(null), false);
  assert.equal(agentAccessKnown(account("user", false, false)), true);
});

test("apiGetProfile normalizes missing access flags from an older server", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [
    { user_id: "u", username: "u", role: "developer" },
    {
      user_id: "u",
      username: "u",
      role: "developer",
      can_use_task_agent: true,
      can_use_code_analyzer: true,
    },
  ];
  globalThis.fetch = async () =>
    new Response(JSON.stringify(bodies.shift()), { status: 200 });
  try {
    const { apiGetProfile } = await import("../src/lib/auth.ts");
    const older = await apiGetProfile();
    assert.equal(older.can_use_task_agent, false);
    assert.equal(older.can_use_code_analyzer, false);
    const current = await apiGetProfile();
    assert.equal(current.can_use_task_agent, true);
    assert.equal(current.can_use_code_analyzer, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("UI surfaces gate restricted assistants and Code Analyzer panels", async () => {
  const source = (path) =>
    readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
  const [dialog, sidebar, page, welcome, chat] = await Promise.all([
    source("app/components/ConfigDialog.tsx"),
    source("app/components/TokenManagementSidebar.tsx"),
    source("app/page.tsx"),
    source("app/components/WelcomeState.tsx"),
    source("app/components/ChatInterface.tsx"),
  ]);
  // Both the built-in list and the fetched list pass through one filter.
  assert.match(dialog, /useState<AssistantOption\[\]>\(BUILT_IN_ASSISTANTS\)/);
  assert.match(dialog, /allowedAssistants\(allAssistants, user\)/);
  assert.match(dialog, /setAssistants\(options\)/);
  assert.match(
    dialog,
    /if \(!open \|\| !codeAnalyzerAllowed\) \{\s*setEngineCatalog\(null\);\s*return;\s*\}[\s\S]*getAnalysisEngines\(\)/
  );
  assert.match(dialog, /setAssistantId\(DEFAULT_ASSISTANT_ID\)/);
  assert.match(
    dialog,
    /Only for developers and administrators that an administrator has enrolled\. Choose it explicitly: the Deep Agent never switches to it, and a conversation stays with the agent it started in\. It runs within a fixed budget/
  );
  const deepAgent = dialog.slice(
    dialog.indexOf('"VSDA Deep Agent": {'),
    dialog.indexOf("[TASK_AGENT_ID]: {")
  );
  assert(deepAgent.length > 100);
  assert.doesNotMatch(deepAgent, /checklist|grader|task agent|code/i);

  assert.match(
    sidebar,
    /\{codeAnalyzerAllowed && \(\s*<>\s*<ScmCredentials \/>\s*<CopilotCredentialPanel key=\{username\} \/>/
  );
  assert.match(page, /allowedAssistantId\(config\.assistantId, user\)/);
  assert.match(page, /agentAccessKnown\(user\)/);
  assert.match(welcome, /agentWelcome\(graphId, user\)/);
  assert.match(chat, /\{canUseCodeAnalyzer\(user\) && \(\s*<CodeAnalysisJobs/);
});
