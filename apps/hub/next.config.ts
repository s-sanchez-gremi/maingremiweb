import type { NextConfig } from "next";
import { resolve } from "node:path";

// The Hub: one start page that links to every portal (CMS admin, CRM, Forms, e-signature). No database, no login: it only renders links.
// React's development build needs eval() (call stacks in the overlay); the production build never does.
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const nextConfig: NextConfig = {
  agentRules: false,
  // Workspace packages are plain TypeScript source (no build step): Next compiles them with the app.
  transpilePackages: ["@apex/ui"],
  // Development only: lets the team open `pnpm dev` from other devices over Tailscale; Next 16 blocks other dev origins.
  allowedDevOrigins: ["**.ts.net"],
  // Only when building the production Docker image: a self-contained server (monorepo root so workspace files are traced).
  ...(process.env.NEXT_STANDALONE ? { output: "standalone" as const, outputFileTracingRoot: resolve(process.cwd(), "../..") } : {}),
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${devEval}; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'none'` },
      ],
    }];
  },
};

export default nextConfig;
