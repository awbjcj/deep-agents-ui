import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APP_BUILD_META_NAME,
  buildFreshnessUrl,
  extractBuildId,
  shouldReloadForBuild,
} from "../src/app/buildFreshness.ts";
import { freshAppUrlAfterAuth } from "../src/app/utils/navigationRecovery.ts";
import {
  clearStreamReconnectState,
  streamRunStorageKey,
} from "../src/app/utils/threadRecovery.ts";
import { clearAuthUser, getAuthUser, saveAuthUser } from "../src/lib/auth.ts";
import { getConfig, saveAssistantId } from "../src/lib/config.ts";

function futureToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })
  )
    .toString("base64url")
    .replace(/=/g, "");
  return `header.${payload}.signature`;
}

function withWindow(windowValue, run) {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });
  try {
    return run();
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
}

test("extracts the deployed build marker regardless of attribute order", () => {
  assert.equal(
    extractBuildId(`<meta name="${APP_BUILD_META_NAME}" content="build-2" />`),
    "build-2"
  );
  assert.equal(
    extractBuildId(
      `<meta content='build-3' data-extra='x' name='${APP_BUILD_META_NAME}'>`
    ),
    "build-3"
  );
});

test("freshness checks reload once for a newer build and stop loops", () => {
  assert.equal(shouldReloadForBuild("build-1", "build-2", null), true);
  assert.equal(shouldReloadForBuild("build-1", "build-2", "build-2"), false);
  assert.equal(shouldReloadForBuild("build-2", "build-2", null), false);
});

test("freshness probe URL bypasses HTTP caches without losing route state", () => {
  assert.equal(
    buildFreshnessUrl("https://agent.example/chat/?threadId=abc#latest", 1234),
    "https://agent.example/chat/?threadId=abc&_fresh=1234#latest"
  );
});

test("first login enters the app through a cache-busted full navigation", () => {
  assert.equal(
    freshAppUrlAfterAuth("https://agent.example/chat/login", 1234),
    "https://agent.example/chat/?_cb=1234"
  );
  assert.equal(
    freshAppUrlAfterAuth("http://localhost:3000/login?return=stale#form", 5678),
    "http://localhost:3000/?_cb=5678"
  );
});

test("every successful authentication path leaves the stale login shell", async () => {
  const source = await readFile(
    new URL("../src/app/login/page.tsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.match(/enterFreshAppAfterAuth\(\);/g)?.length, 2);
  assert.doesNotMatch(source, /router\.push\("\/"\)/);
});

test("successful login and config writes survive blocked localStorage", () => {
  const blockedStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    },
  };

  withWindow(
    {
      localStorage: blockedStorage,
      dispatchEvent() {},
    },
    () => {
      const user = {
        user_id: "user-1",
        username: "first.login",
        role: "user",
        access_token: futureToken(),
      };

      assert.doesNotThrow(() => saveAuthUser(user));
      assert.deepEqual(getAuthUser(), user);

      process.env.NEXT_PUBLIC_DEPLOYMENT_URL = "https://agent.example";
      assert.doesNotThrow(() => saveAssistantId("VSDA Deep Agent"));
      assert.equal(getConfig()?.assistantId, "VSDA Deep Agent");

      assert.doesNotThrow(() => clearAuthUser());
      assert.equal(getAuthUser(), null);
    }
  );
});

test("thread recovery removes stale reconnect metadata even when storage fails", () => {
  const removed = [];
  const storage = {
    removeItem(key) {
      removed.push(key);
    },
  };
  assert.equal(clearStreamReconnectState("thread-1", storage), true);
  assert.deepEqual(removed, [streamRunStorageKey("thread-1")]);

  assert.equal(
    clearStreamReconnectState("thread-2", {
      removeItem() {
        throw new Error("storage blocked");
      },
    }),
    false
  );
});
