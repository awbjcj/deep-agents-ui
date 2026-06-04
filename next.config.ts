import type { NextConfig } from "next";

// Three deployment profiles select which host/port the UI talks to:
//   - dev    (`next dev`)             → http://localhost:2024
//   - build  (`NEXT_STATIC_EXPORT=1`) → http://localhost:8000
//   - deploy (`NEXT_STATIC_EXPORT=1`) → http://10.206.26.122:8000
//
// For build/deploy the app is a static export and the API URL is baked in at
// build time via NEXT_PUBLIC_DEPLOYMENT_URL (set by scripts/rebuild.sh). Static
// exports ignore rewrites, so the /api/* proxy below only applies to `next dev`.
// The dev proxy target can be overridden with LANGGRAPH_API_URL if needed.
const isStaticExport =
  process.env.NEXT_STATIC_EXPORT === "1" ||
  process.env.NODE_ENV === "production";

const devApiBase = process.env.LANGGRAPH_API_URL || "http://localhost:2024";

const nextConfig: NextConfig = isStaticExport
  ? { output: "export", basePath: "/chat" }
  : {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: devApiBase.replace(/\/$/, "") + "/api/:path*",
          },
        ];
      },
    };

export default nextConfig;
