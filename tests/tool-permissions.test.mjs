import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import React from "react";

import {
  ToolPermissionsApiError,
  apiGetAdminToolPermissions,
  apiGetUserToolPermissions,
  apiSetTierToolPermissions,
  apiSetUserToolPermissions,
  canSaveToolPermissions,
  canToggleTool,
  mergeRetainedSelection,
} from "../src/lib/tool-permissions.ts";
import { ToolPermissionList } from "../src/app/components/tool-permissions/ToolPermissionList.tsx";

const catalog = [
  {
    id: "send_email",
    label: "Send email",
    group: "Communication",
    description: "Send an email through the configured account.",
    prerequisites: "Email credentials required",
  },
  {
    id: "manage_library",
    label: "Manage library",
    group: "Knowledge",
    description: "Change shared library content.",
    prerequisites: null,
  },
];

test("retained blocked selections can be cleared but cannot be added again", () => {
  const stored = ["send_email"];
  const allowed = [];
  assert.equal(canToggleTool("send_email", stored, allowed), true);
  assert.equal(canToggleTool("send_email", [], allowed), false);
  assert.deepEqual(
    mergeRetainedSelection(["send_email"], "manage_library", true),
    ["manage_library", "send_email"]
  );
});

test("save eligibility requires an authoritative, reviewed policy snapshot", () => {
  assert.equal(
    canSaveToolPermissions({
      hasSnapshot: false,
      dirty: true,
      saving: false,
      policyReviewRequired: false,
    }),
    false
  );
  assert.equal(
    canSaveToolPermissions({
      hasSnapshot: true,
      dirty: true,
      saving: false,
      policyReviewRequired: true,
    }),
    false
  );
  assert.equal(
    canSaveToolPermissions({
      hasSnapshot: true,
      dirty: true,
      saving: false,
      policyReviewRequired: false,
    }),
    true
  );
});

test("typed API sends optimistic revision payloads and no account identity", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/admin/tool-permissions/user")) {
      return Response.json({
        tier: "user",
        allowed_tool_ids: ["send_email"],
        revision: 4,
      });
    }
    return Response.json({
      catalog,
      tier: "user",
      tier_revision: "user:7",
      selection_revision: 3,
      allowed_tool_ids: ["send_email"],
      selected_tool_ids: ["send_email"],
      effective_tool_ids: ["send_email"],
      blocked_tool_ids: [],
    });
  };
  try {
    await apiSetTierToolPermissions("user", ["send_email"], 3);
    await apiSetUserToolPermissions(["send_email"], 2, "user:7");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(JSON.parse(requests[0].options.body), {
    allowed_tool_ids: ["send_email"],
    expected_revision: 3,
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    selected_tool_ids: ["send_email"],
    expected_selection_revision: 2,
    expected_tier_revision: "user:7",
  });
  assert.doesNotMatch(requests[1].options.body, /account|role|tier\"/i);
});

test("API errors preserve conflict and unavailable status with safe fallback text", async () => {
  const originalFetch = globalThis.fetch;
  let response = new Response(
    JSON.stringify({
      detail: {
        code: "tool_permissions_conflict",
        message: "Policy changed",
      },
    }),
    { status: 409, headers: { "content-type": "application/json" } }
  );
  globalThis.fetch = async () => response;
  try {
    await assert.rejects(
      apiGetUserToolPermissions(),
      (error) =>
        error instanceof ToolPermissionsApiError &&
        error.status === 409 &&
        error.code === "tool_permissions_conflict" &&
        error.message === "Policy changed"
    );
    response = new Response("storage offline", { status: 503 });
    await assert.rejects(
      apiGetAdminToolPermissions(),
      (error) =>
        error instanceof ToolPermissionsApiError &&
        error.status === 503 &&
        error.message === "Tool permissions are unavailable."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shared list renders grouped semantic controls and blocked state", () => {
  const html = renderToStaticMarkup(
    React.createElement(ToolPermissionList, {
      catalog,
      selectedIds: ["send_email"],
      allowedIds: [],
      effectiveIds: [],
      idPrefix: "personal-tools",
      saving: false,
      onToggle() {},
    })
  );
  assert.match(html, /Communication/);
  assert.match(html, /Knowledge/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked=""/);
  assert.match(html, /Blocked by administrator/);
  assert.match(html, /Email credentials required/);
  assert.match(
    html,
    /aria-describedby="personal-tools-send_email-description"/
  );
});

test("personal list distinguishes pending selections and removals from saved active tools", () => {
  const pendingSelection = renderToStaticMarkup(
    React.createElement(ToolPermissionList, {
      catalog,
      selectedIds: ["manage_library"],
      allowedIds: ["manage_library"],
      effectiveIds: [],
      idPrefix: "pending-selection",
      saving: false,
      onToggle() {},
    })
  );
  assert.match(pendingSelection, /Pending save/);
  assert.doesNotMatch(pendingSelection, />Active</);

  const pendingRemoval = renderToStaticMarkup(
    React.createElement(ToolPermissionList, {
      catalog,
      selectedIds: [],
      allowedIds: ["manage_library"],
      effectiveIds: ["manage_library"],
      idPrefix: "pending-removal",
      saving: false,
      onToggle() {},
    })
  );
  assert.match(pendingRemoval, /Pending removal/);

  const savedActive = renderToStaticMarkup(
    React.createElement(ToolPermissionList, {
      catalog,
      selectedIds: ["manage_library"],
      allowedIds: ["manage_library"],
      effectiveIds: ["manage_library"],
      idPrefix: "saved-active",
      saving: false,
      onToggle() {},
    })
  );
  assert.match(savedActive, />Active</);
  assert.doesNotMatch(savedActive, /Pending save/);
});
