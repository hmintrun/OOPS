import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  experimental: {
    // Keep compilation in the build process on Windows runners with restricted child workers.
    webpackBuildWorker: false,
    cpus: process.platform === "win32" ? 1 : undefined,
  },
};

export default nextConfig;
