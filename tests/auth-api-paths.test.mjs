import assert from "node:assert/strict";
import test from "node:test";

test("admin API helpers encode identifiers as single path segments", async () => {
  const previousFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return new Response("[]", { status: 200 });
  };
  try {
    const { apiGetUserUsage, apiListScopeMembers } = await import(
      "../src/lib/auth.ts"
    );
    await apiGetUserUsage("a/b?c#d");
    await apiListScopeMembers("team", "ops/../x");
    assert.match(urls[0], /\/admin\/token-usage\/users\/a%2Fb%3Fc%23d$/);
    assert.match(urls[1], /\/admin\/scopes\/team\/ops%2F\.\.%2Fx\/members$/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
