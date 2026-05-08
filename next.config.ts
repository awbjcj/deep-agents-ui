import type { NextConfig } from "next";

// `process.env.NODE_ENV === "production"` corresponds to `next build`
// Without it, the dev server rewrites keep /api/* proxied to the LangGraph runtime.
const isStaticExport =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? { output: "export", basePath: "/chat" }
  : {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:2024/api/:path*",
          },
        ];
      },
    };

export default nextConfig;
