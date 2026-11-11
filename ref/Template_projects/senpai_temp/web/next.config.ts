import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pronunciation dictionary is a 3.6 MB object; load it from node_modules instead of bundling it.
  serverExternalPackages: ["cmu-pronouncing-dictionary"],
};

export default nextConfig;
