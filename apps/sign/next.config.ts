import type { NextConfig } from "next";
import { resolve } from "node:path";

// The Signatures app: staff send PDFs to be signed electronically; signers sign from a private link. See docs/esign-plan.md.
const nextConfig: NextConfig = {
  agentRules: false,
  // Workspace packages are plain TypeScript source (no build step): Next compiles them with the app.
  transpilePackages: ["@apex/db", "@apex/core", "@apex/ui", "@apex/sign"],
  // Development only: lets the team open `pnpm dev` from other devices over Tailscale; Next 16 blocks other dev origins.
  allowedDevOrigins: ["**.ts.net"],
  // Staff upload the PDF to be signed (max 15 MB + form overhead); default is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "17mb" } },
  // A signatures session, a forms session, a CRM session and a website session must never be interchangeable (browsers share cookies across ports on localhost).
  env: { SESSION_COOKIE: process.env.SESSION_COOKIE ?? "apex_sign_session" },
  // Only when building the production Docker image: a self-contained server (monorepo root so workspace files are traced).
  ...(process.env.NEXT_STANDALONE ? { output: "standalone" as const, outputFileTracingRoot: resolve(process.cwd(), "../..") } : {}),
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
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
