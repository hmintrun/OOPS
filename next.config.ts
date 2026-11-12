import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    // Keep compilation in the build process on Windows runners with restricted child workers.
    webpackBuildWorker: false,
    cpus: process.platform === "win32" ? 1 : undefined,
  },
};

export default nextConfig;
