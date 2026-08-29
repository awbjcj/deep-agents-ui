import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { newsletterProgress } from "../src/lib/newsletters.ts";

function detail(overrides = {}) {
  return {
    id: "newsletter-1",
    subject: "News",
    body_markdown: "Hello",
    body_html: "<p>Hello</p>",
    target_tiers: null,
    status: "sending",
    created_by: "admin",
    created_at: "2026-08-29T12:00:00Z",
    sent_at: null,
    total_recipients: 10,
    sent_count: 0,
    failed_count: 0,
    pending: 6,
    sent: 3,
    failed: 1,
    deliveries: null,
    ...overrides,
  };
}

test("newsletter progress counts terminal deliveries and stays bounded", () => {
  assert.equal(newsletterProgress(detail()), 40);
  assert.equal(
    newsletterProgress(detail({ sent: 12, failed: 1, pending: 0 })),
    100
  );
  assert.equal(newsletterProgress(detail({ total_recipients: 0 })), 0);
});

test("newsletter panel keeps previews sandboxed and exposes the proof-send flow", async () => {
  const source = await readFile(
    new URL(
      "../src/app/components/admin/NewsletterSection.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /sandbox=""/);
  assert.match(source, /apiTestNewsletter/);
  assert.match(source, /apiUpdateNewsletter/);
  assert.match(source, /Send test/);
  assert.match(source, /Send now/);
});
