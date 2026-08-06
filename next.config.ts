import type { NextConfig } from "next";

// Three deployment profiles select which host/port the UI talks to:
//   - dev    (`next dev`)             → http://localhost:2024
//   - build  (`NEXT_STATIC_EXPORT=1`) → http://localhost:8000
//   - deploy (`NEXT_STATIC_EXPORT=1`) → https://agent.vsda.top
//
// For build/deploy the app is a static export and the API URL is baked in at
// build time via NEXT_PUBLIC_DEPLOYMENT_URL (set by scripts/rebuild.sh). Static
// exports ignore rewrites, so the /api/* proxy below only applies to `next dev`.
// The dev proxy target can be overridden with LANGGRAPH_API_URL if needed.
const isStaticExport =
  process.env.NEXT_STATIC_EXPORT === "1" ||
  process.env.NODE_ENV === "production";

const DEFAULT_DEV_API_BASE = "http://localhost:2024";

// The rewrite destination is a server-side fetch target, so a typo or a stray
// value in the environment could aim it at a non-HTTP scheme. Reject anything
// that isn't http/https instead of proxying it.
function resolveDevApiBase(): string {
  const raw = process.env.LANGGRAPH_API_URL;
  if (!raw) return DEFAULT_DEV_API_BASE;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`LANGGRAPH_API_URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `LANGGRAPH_API_URL must use http: or https:, got ${parsed.protocol}`,
    );
  }
  return raw.replace(/\/$/, "");
}

// Applied by `next dev` only. For build/deploy the app is a static export
// served by the FastAPI backend, which sets the full header set (including
// CSP) from its SecurityHeadersMiddleware — static exports ignore both
// headers() and rewrites(). CSP is omitted here so Turbopack HMR keeps working.
const DEV_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = isStaticExport
  ? { output: "export", basePath: "/chat" }
  : {
      async headers() {
        return [{ source: "/:path*", headers: DEV_SECURITY_HEADERS }];
      },
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: resolveDevApiBase() + "/api/:path*",
          },
        ];
      },
    };

export default nextConfig;
