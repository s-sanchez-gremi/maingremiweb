import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Browser hardening that never changes: the Content-Security-Policy and framing rules are set per request in proxy.ts.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};

export default nextConfig;
