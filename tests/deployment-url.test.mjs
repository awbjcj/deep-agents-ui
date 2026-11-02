import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeploymentUrl,
  SAME_ORIGIN_DEPLOYMENT_URL,
} from "../src/lib/config.ts";

function withEnvironment({ url, staticExport, origin }, run) {
  const previousUrl = process.env.NEXT_PUBLIC_DEPLOYMENT_URL;
  const previousStatic = process.env.NEXT_PUBLIC_VSDA_STATIC_EXPORT;
  const previousWindow = globalThis.window;
  const assign = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  assign("NEXT_PUBLIC_DEPLOYMENT_URL", url);
  assign("NEXT_PUBLIC_VSDA_STATIC_EXPORT", staticExport);
  if (origin === undefined) {
    delete globalThis.window;
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin } },
    });
  }
  try {
    return run();
  } finally {
    assign("NEXT_PUBLIC_DEPLOYMENT_URL", previousUrl);
    assign("NEXT_PUBLIC_VSDA_STATIC_EXPORT", previousStatic);
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

test("an absolute deployment URL is used as configured", () => {
  withEnvironment(
    {
      url: "https://agent.example",
      staticExport: "1",
      origin: "http://127.0.0.1:2024",
    },
    () => assert.equal(getDeploymentUrl(), "https://agent.example")
  );
});

test("static exports without a URL call the origin that served them", () => {
  for (const origin of ["http://localhost:8000", "http://127.0.0.1:2024"]) {
    withEnvironment({ url: undefined, staticExport: "1", origin }, () =>
      assert.equal(getDeploymentUrl(), origin)
    );
  }
});

test("the same-origin keyword overrides a checkout's baked URL", () => {
  withEnvironment(
    {
      url: SAME_ORIGIN_DEPLOYMENT_URL,
      staticExport: undefined,
      origin: "https://agent.example",
    },
    () => assert.equal(getDeploymentUrl(), "https://agent.example")
  );
});

test("dev servers and non-HTTP origins stay unconfigured", () => {
  withEnvironment(
    {
      url: undefined,
      staticExport: undefined,
      origin: "http://localhost:3000",
    },
    () => assert.equal(getDeploymentUrl(), "")
  );
  withEnvironment(
    { url: SAME_ORIGIN_DEPLOYMENT_URL, staticExport: "1", origin: "null" },
    () => assert.equal(getDeploymentUrl(), "")
  );
  withEnvironment(
    { url: SAME_ORIGIN_DEPLOYMENT_URL, staticExport: "1", origin: undefined },
    () => assert.equal(getDeploymentUrl(), "")
  );
});
