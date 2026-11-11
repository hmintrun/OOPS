import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep compilation in the build process on Windows runners with restricted child workers.
    webpackBuildWorker: false,
  },
};

export default nextConfig;
