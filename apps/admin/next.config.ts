import type { NextConfig } from "next";
import { resolve } from "node:path";

// The CMS admin app: content, media, categories, settings, users, errors, the visual page builder and the scheduler that
// publishes scheduled content. It writes the website's tables; the website (apps/web) only reads them and is asked to refresh
// its cache over HTTP after every change (lib/cache.ts).
const nextConfig: NextConfig = {
  agentRules: false,
  // Workspace packages are plain TypeScript source (no build step): Next compiles them with the app.
  transpilePackages: ["@apex/db", "@apex/core", "@apex/ui", "@apex/sections"],
  // Development only: lets the team open `pnpm dev` from other devices over Tailscale (http://NAME.TAILNET.ts.net:PORT); Next 16 blocks other dev origins.
  allowedDevOrigins: ["**.ts.net"],
  // Staff upload files through the media library (max 15 MB + form overhead); default is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  // Only when building the production Docker image: a self-contained server (monorepo root so workspace files are traced).
  ...(process.env.NEXT_STANDALONE ? { output: "standalone" as const, outputFileTracingRoot: resolve(process.cwd(), "../..") } : {}),
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
