import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillDetails } from "../src/app/components/skills/SkillDetails.tsx";

const referenceDiagnostic = {
  code: "system_skill_resource_escape",
  message: "A referenced resource is outside this skill package.",
  path: "SKILL.md",
};
const missingDiagnostic = {
  code: "system_skill_missing",
  message: "Resource requires an installed worker deployment.",
  path: "SKILL.md",
};
const file = {
  path: "SKILL.md",
  content:
    "---\nname: jira-field-mapping\ndescription: Map Jira fields\n---\nRead the [query guide](../jira-query-guide/SKILL.md).\n",
};

function render(diagnostics, availability = "available") {
  return renderToStaticMarkup(
    React.createElement(SkillDetails, {
      skill: {
        id: "sys_fixture",
        name: "jira-field-mapping",
        description: "Map Jira fields",
        origin: "system",
        availability,
        revision: null,
        created_at: null,
        updated_at: null,
        resources: [
          {
            path: "SKILL.md",
            size_bytes: file.content.length,
            copyable: availability === "available",
            diagnostics: [],
          },
        ],
        diagnostics,
      },
      files: availability === "available" ? [file] : [],
      onCopy() {
        throw new Error("Rendering must not copy a skill.");
      },
    })
  );
}

test("external references explain the copy restriction without marking a readable system skill as broken", () => {
  const html = render([referenceDiagnostic]);
  const [details, copyForm] = html.split("<form");
  assert.match(details, /query guide/);
  assert.doesNotMatch(details, /Needs attention/);
  assert.doesNotMatch(details, /A referenced resource is outside/);
  assert.match(copyForm, /Cannot copy this skill as-is/);
  assert.match(copyForm, /A referenced resource is outside this skill package/);
  assert.match(copyForm, /<button[^>]*disabled=""[^>]*>[\s\S]*Copy as draft/);
});

test("missing deployment resources still appear as problems above the copy form", () => {
  const html = render([missingDiagnostic], "unavailable");
  const [details, copyForm] = html.split("<form");
  assert.match(details, /Needs attention/);
  assert.match(details, /Resource requires an installed worker deployment/);
  assert.doesNotMatch(copyForm, /Cannot copy this skill as-is/);
  assert.match(copyForm, /<button[^>]*disabled=""[^>]*>[\s\S]*Copy as draft/);
});

test("a reference warning cannot conceal a separate missing resource", () => {
  const html = render([referenceDiagnostic, missingDiagnostic]);
  const [details, copyForm] = html.split("<form");
  assert.match(details, /Needs attention/);
  assert.match(details, /Resource requires an installed worker deployment/);
  assert.doesNotMatch(details, /A referenced resource is outside/);
  assert.match(copyForm, /Cannot copy this skill as-is/);
});

test("a complete system package remains copyable without warnings", () => {
  const html = render([]);
  const [, copyForm] = html.split("<form");
  assert.doesNotMatch(html, /Needs attention|Cannot copy this skill as-is/);
  assert.doesNotMatch(copyForm, /disabled=""/);
  assert.match(copyForm, /Copy as draft/);
});
