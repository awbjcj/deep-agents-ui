import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  BOOT_ATTEMPT_KEY,
  BOOT_READY_FLAG,
  BOOT_WATCHDOG_MS,
  bootRecoveryScript,
} from "../src/app/bootRecovery.ts";

/**
 * Minimal DOM/window stub. The boot script only touches window, document,
 * sessionStorage, navigator and location, so a hand-rolled harness is enough
 * and keeps the test dependency-free.
 */
function createHarness({
  online = true,
  visibility = "visible",
  storage = true,
  search = "",
} = {}) {
  const timers = [];
  const listeners = new Map();
  const docListeners = new Map();
  const reloads = [];
  const replaces = [];
  const store = new Map();
  const appended = [];

  const makeElement = () => ({
    style: { cssText: "" },
    setAttribute() {},
    appendChild() {},
    set innerHTML(_v) {},
    set textContent(_v) {},
    onclick: null,
  });

  const document = {
    documentElement: { classList: { contains: () => false } },
    body: { appendChild: (el) => appended.push(el) },
    visibilityState: visibility,
    getElementById: () => null,
    createElement: () => makeElement(),
    addEventListener(type, fn) {
      docListeners.set(type, (docListeners.get(type) ?? []).concat(fn));
    },
    removeEventListener(type, fn) {
      docListeners.set(
        type,
        (docListeners.get(type) ?? []).filter((f) => f !== fn),
      );
    },
  };

  const sessionStorage = storage
    ? {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      }
    : {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
        removeItem() {
          throw new Error("blocked");
        },
      };

  const window = {
    document,
    sessionStorage,
    navigator: { onLine: online },
    location: {
      href: "https://agent.example/chat/" + search,
      search,
      reload: () => reloads.push(true),
      replace: (url) => replaces.push(url),
    },
    URL,
    Promise,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    addEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).concat(fn));
    },
  };
  window.window = window;

  const context = vm.createContext({
    window,
    document,
    navigator: window.navigator,
    URL,
    Promise,
    setTimeout: window.setTimeout,
    parseInt,
    String,
    Date,
    console,
  });
  vm.runInContext(bootRecoveryScript, context);

  return {
    window,
    document,
    store,
    appended,
    reloads,
    replaces,
    fire: (type, event) => (listeners.get(type) ?? []).forEach((fn) => fn(event)),
    fireDoc: (type, event) =>
      (docListeners.get(type) ?? []).slice().forEach((fn) => fn(event)),
    runTimers: () => {
      const pending = timers.splice(0, timers.length);
      pending.forEach(({ fn }) => fn());
    },
    pendingTimers: () => timers.map((t) => t.ms),
  };
}

test("arms a hydration watchdog on load", () => {
  const h = createHarness();
  assert.deepEqual(h.pendingTimers(), [BOOT_WATCHDOG_MS]);
});

test("reloads once when hydration never signals ready", () => {
  const h = createHarness();
  h.runTimers();
  assert.equal(h.reloads.length, 1);
  assert.equal(h.store.get(BOOT_ATTEMPT_KEY), "1");
});

test("does not reload after the app signals it is ready", () => {
  const h = createHarness();
  h.window[BOOT_READY_FLAG] = true;
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.replaces.length, 0);
});

test("recovers from a failed _next chunk request", () => {
  const h = createHarness();
  h.fire("error", {
    target: { tagName: "SCRIPT", src: "https://agent.example/chat/_next/static/chunks/main.js" },
  });
  assert.equal(h.reloads.length, 1);
});

test("ignores asset errors unrelated to the build output", () => {
  const h = createHarness();
  h.fire("error", {
    target: { tagName: "IMG", src: "https://agent.example/chat/assets/logo.svg" },
  });
  h.fire("error", {
    target: { tagName: "SCRIPT", src: "https://cdn.example/analytics.js" },
  });
  assert.equal(h.reloads.length, 0);
});

test("recovers from a ChunkLoadError promise rejection", () => {
  const h = createHarness();
  h.fire("unhandledrejection", {
    reason: Object.assign(new Error("Loading chunk 42 failed"), {
      name: "ChunkLoadError",
    }),
  });
  assert.equal(h.reloads.length, 1);
});

test("second attempt busts the HTTP cache instead of a plain reload", () => {
  const h = createHarness();
  h.store.set(BOOT_ATTEMPT_KEY, "1");
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.replaces.length, 1);
  assert.match(h.replaces[0], /[?&]_cb=\d+/);
  assert.equal(h.store.get(BOOT_ATTEMPT_KEY), "2");
});

test("stops reloading after the attempt budget and shows a fallback", () => {
  const h = createHarness();
  h.store.set(BOOT_ATTEMPT_KEY, "2");
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.replaces.length, 0);
  assert.equal(h.appended.length, 1, "expected the manual-retry fallback to render");
});

test("without sessionStorage, recovery gets exactly one cache-busted attempt", () => {
  const h = createHarness({ storage: false });
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.replaces.length, 1, "expected a single cache-busting reload");
  assert.match(h.replaces[0], /[?&]_cb=\d+/);
});

test("without sessionStorage, a cache-busted URL stops the loop", () => {
  const h = createHarness({ storage: false, search: "?_cb=123" });
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.replaces.length, 0, "must not reload again");
  assert.equal(h.appended.length, 1);
});

test("offline boots show the fallback rather than reloading", () => {
  const h = createHarness({ online: false });
  h.runTimers();
  assert.equal(h.reloads.length, 0);
  assert.equal(h.appended.length, 1);
});

test("a backgrounded tab defers the verdict until it becomes visible", () => {
  const h = createHarness({ visibility: "hidden" });
  h.runTimers();
  assert.equal(h.reloads.length, 0, "hidden tabs must not be reloaded");

  h.document.visibilityState = "visible";
  h.fireDoc("visibilitychange", {});
  assert.deepEqual(h.pendingTimers(), [BOOT_WATCHDOG_MS], "re-arms on focus");
  h.runTimers();
  assert.equal(h.reloads.length, 1);
});
