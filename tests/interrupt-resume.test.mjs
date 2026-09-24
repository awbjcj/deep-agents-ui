import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BatchToolApprovalInterrupt } from "../src/app/components/BatchToolApprovalInterrupt.tsx";
import { PendingToolApproval } from "../src/app/components/PendingToolApproval.tsx";
import { ToolApprovalInterrupt } from "../src/app/components/ToolApprovalInterrupt.tsx";
import {
  buildInterruptResume,
  createInterruptResumeHandler,
  selectPendingInterrupt,
} from "../src/app/utils/interruptResume.ts";

const sameNamedWrites = [
  {
    id: "first-write",
    value: {
      action_requests: [
        {
          name: "create_jira_ticket",
          args: { title: "First ticket" },
          description: "Create the **first** reviewed ticket.",
        },
      ],
    },
  },
  {
    id: "second-write",
    value: {
      action_requests: [
        {
          name: "create_jira_ticket",
          args: { title: "Second ticket" },
          description: "Create the **second** reviewed ticket.",
        },
      ],
    },
  },
];

function approvalHarness(initialPending) {
  let pending = initialPending;
  const submissions = [];
  const staleIds = [];

  return {
    get pending() {
      return pending;
    },
    submissions,
    staleIds,
    respondWith(nextPending) {
      pending = nextPending;
    },
    renderSelected() {
      const interrupt = selectPendingInterrupt(pending);
      const onResume = createInterruptResumeHandler({
        getPending: () => pending,
        selectedId: interrupt?.id,
        submit: (resume) => submissions.push(resume),
        onStale: () => staleIds.push(interrupt?.id),
      });
      const panel = PendingToolApproval({ interrupt, onResume });
      return {
        interrupt,
        panel,
        html: renderToStaticMarkup(panel),
      };
    },
  };
}

function singleApprovalElement(panel) {
  assert.ok(isValidElement(panel));
  assert.equal(panel.type, "div");
  const approval = panel.props.children;
  assert.ok(isValidElement(approval));
  assert.equal(approval.type, ToolApprovalInterrupt);
  return approval;
}

test("same-named rendered writes advance by ID with fresh controls and deny stale callbacks", () => {
  const h = approvalHarness(sameNamedWrites);
  const first = h.renderSelected();
  assert.equal(first.interrupt.id, "first-write");
  assert.equal(first.panel.key, "first-write");
  assert.match(
    first.html,
    /Create the <strong>first<\/strong> reviewed ticket/
  );
  assert.doesNotMatch(first.html, /<strong>second<\/strong> reviewed ticket/);
  assert.match(first.html, />Reject<\/button>/);
  assert.match(first.html, />Edit<\/button>/);
  assert.match(first.html, />Approve<\/button>/);

  const firstApproval = singleApprovalElement(first.panel);
  const rejection = {
    decisions: [{ type: "reject", message: "Reject only the first" }],
  };
  firstApproval.props.onResume(rejection);
  assert.deepEqual(h.submissions, [{ "first-write": rejection }]);

  h.respondWith([sameNamedWrites[1]]);
  const second = h.renderSelected();
  assert.equal(second.interrupt.id, "second-write");
  assert.equal(second.panel.key, "second-write");
  assert.notEqual(second.panel.key, first.panel.key);
  assert.match(
    second.html,
    /Create the <strong>second<\/strong> reviewed ticket/
  );
  assert.doesNotMatch(second.html, /<strong>first<\/strong> reviewed ticket/);
  assert.match(second.html, />Reject<\/button>/);
  assert.match(second.html, />Edit<\/button>/);
  assert.match(second.html, />Approve<\/button>/);

  firstApproval.props.onResume({ decisions: [{ type: "approve" }] });
  assert.deepEqual(h.submissions, [{ "first-write": rejection }]);
  assert.deepEqual(h.staleIds, ["first-write"]);

  const edit = {
    decisions: [
      {
        type: "edit",
        edited_action: {
          name: "create_jira_ticket",
          args: { title: "Edited second ticket" },
        },
      },
    ],
  };
  singleApprovalElement(second.panel).props.onResume(edit);
  assert.deepEqual(h.submissions[1], { "second-write": edit });
});

test("the selected single panel routes approval only to its interrupt ID", () => {
  const h = approvalHarness(sameNamedWrites);
  h.respondWith([sameNamedWrites[1]]);
  const second = h.renderSelected();
  const approval = { decisions: [{ type: "approve" }] };
  singleApprovalElement(second.panel).props.onResume(approval);
  assert.deepEqual(h.submissions, [{ "second-write": approval }]);
});

test("the selected multi-action search interrupt renders the real ordered batch panel", () => {
  const batchInterrupt = {
    id: "search-batch",
    value: {
      action_requests: [
        {
          name: "search_jira_tickets",
          args: { jql: "project = DEMO ORDER BY created DESC" },
          description: "Search Jira before Confluence.",
        },
        {
          name: "search_confluence",
          args: { cql: 'space = "DEMO"' },
          description: "Search Confluence after Jira.",
        },
      ],
      review_configs: [
        {
          action_name: "search_jira_tickets",
          allowed_decisions: ["approve", "edit", "reject"],
        },
        {
          action_name: "search_confluence",
          allowed_decisions: ["approve", "reject"],
        },
      ],
    },
  };
  const h = approvalHarness([batchInterrupt]);
  const rendered = h.renderSelected();
  assert.ok(isValidElement(rendered.panel));
  assert.equal(rendered.panel.type, BatchToolApprovalInterrupt);
  assert.equal(rendered.panel.key, "search-batch");
  assert.match(rendered.html, /Review 2 pending actions/);
  assert.ok(
    rendered.html.indexOf("Search Jira before Confluence") <
      rendered.html.indexOf("Search Confluence after Jira")
  );
  assert.ok(
    rendered.html.indexOf("Action 1 of 2") <
      rendered.html.indexOf("Action 2 of 2")
  );
  assert.match(
    rendered.html,
    /<button[^>]*disabled=""[^>]*>Continue<\/button>/
  );

  const decisions = {
    decisions: [
      {
        type: "edit",
        edited_action: {
          name: "search_jira_tickets",
          args: { jql: "project = DEMO ORDER BY priority DESC" },
        },
      },
      { type: "reject", message: "Skip Confluence" },
    ],
  };
  rendered.panel.props.onResume(decisions);
  assert.deepEqual(h.submissions, [{ "search-batch": decisions }]);
  assert.deepEqual(
    h.submissions[0]["search-batch"].decisions.map((decision) =>
      decision.type === "edit" ? decision.edited_action.name : decision.type
    ),
    ["search_jira_tickets", "reject"]
  );
});

test("resume helpers preserve exact payloads and reject missing IDs", () => {
  const pending = [
    {
      id: "first",
    },
  ];
  const decision = { decisions: [{ type: "approve" }] };
  assert.equal(selectPendingInterrupt(pending).id, "first");
  assert.deepEqual(buildInterruptResume(pending, "first", decision), {
    first: decision,
  });
  assert.throws(
    () => buildInterruptResume([], "first", decision),
    /no longer pending/
  );
  assert.equal(selectPendingInterrupt([]), undefined);
  assert.throws(
    () => buildInterruptResume([], undefined, decision),
    /no longer pending/
  );
});
