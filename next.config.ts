import type { NextConfig } from "next";

// NEXT_STATIC_EXPORT=1 produces an `out/` directory for FastAPI/uvicorn serving.
// Without it, the dev server rewrites keep /api/* proxied to the LangGraph runtime.
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

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
