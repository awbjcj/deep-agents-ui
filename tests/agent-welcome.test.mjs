import assert from "node:assert/strict";
import test from "node:test";
import {
  agentWelcome,
  DEFAULT_WELCOME_AGENT,
  WELCOME_AGENT_IDS,
} from "../src/lib/agent-welcome.ts";

// Graphs registered in the backend's langgraph.json.
const GRAPHS = [
  "VSDA Deep Agent",
  "VSDA Task Agent",
  "VSDA Jira Agent",
  "VSDA Teams Agent",
  "VSDA Email Agent",
  "VSDA SharePoint Agent",
  "VSDA Knowledge Base Agent",
  "VSDA Polarion Agent",
  "VSDA Confluence Agent",
  "VSDA Jenkins Agent",
  "VSDA Code Analyzer Agent",
];

const DEVELOPER = {
  role: "developer",
  can_use_task_agent: true,
  can_use_code_analyzer: true,
};
const USER = {
  role: "user",
  can_use_task_agent: false,
  can_use_code_analyzer: false,
};

test("every built-in agent has its own welcome copy and starter prompts", () => {
  assert.deepEqual([...WELCOME_AGENT_IDS].sort(), [...GRAPHS].sort());
  const headlines = new Set();
  for (const graph of GRAPHS) {
    const welcome = agentWelcome(graph, DEVELOPER);
    assert.equal(welcome.name, graph);
    assert(welcome.lede.length > 40, `${graph} explains its scope`);
    assert.equal(welcome.prompts.length, 4, `${graph} offers four prompts`);
    assert.equal(
      new Set(welcome.prompts.map((prompt) => prompt.title)).size,
      4,
      `${graph} prompt titles are unique`
    );
    headlines.add(welcome.headline);
  }
  assert.equal(headlines.size, GRAPHS.length, "Headlines differ per agent");
});

test("unknown and legacy agent IDs resolve to sensible welcome copy", () => {
  assert.equal(agentWelcome(undefined).name, DEFAULT_WELCOME_AGENT);
  assert.equal(agentWelcome("custom-graph").name, DEFAULT_WELCOME_AGENT);
  assert.equal(
    agentWelcome("VSDA Database Agent").name,
    "VSDA Knowledge Base Agent"
  );
});

test("ordinary users never see restricted agents or code analysis in welcome copy", () => {
  for (const access of [USER, undefined, { role: "developer" }]) {
    for (const graph of ["VSDA Task Agent", "VSDA Code Analyzer Agent"])
      assert.equal(agentWelcome(graph, access).name, DEFAULT_WELCOME_AGENT);
    const supervisor = JSON.stringify(agentWelcome("VSDA Deep Agent", access));
    assert.doesNotMatch(supervisor, /code analy|task agent|checklist|grade/i);
  }
  const enrolledOnlyForCode = { ...DEVELOPER, can_use_task_agent: false };
  assert.equal(
    agentWelcome("VSDA Task Agent", enrolledOnlyForCode).name,
    DEFAULT_WELCOME_AGENT
  );
  assert.equal(
    agentWelcome("VSDA Code Analyzer Agent", enrolledOnlyForCode).name,
    "VSDA Code Analyzer Agent"
  );
});
