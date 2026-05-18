import type { NextConfig } from "next";

// `NEXT_STATIC_EXPORT=1` produces a fully static export (output: "export").
// `next build` (NODE_ENV=production) proxies /api/* to the LangGraph runtime on port 8123.
// `next dev` proxies /api/* to the LangGraph runtime on port 2024.
const isStaticExport =
  process.env.NEXT_STATIC_EXPORT === "1" ||
  process.env.NODE_ENV === "production";
const isProduction = process.env.NODE_ENV === "production";

const apiPort = isProduction ? 8123 : 2024;

const nextConfig: NextConfig = isStaticExport
  ? { output: "export", basePath: "/chat" }
  : {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:" + apiPort + "/api/:path*",
          },
        ];
      },
    };

export default nextConfig;
