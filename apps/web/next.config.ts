import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
