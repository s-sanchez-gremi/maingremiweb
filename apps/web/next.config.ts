import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The e2e run builds into its own folder so its cache can never mix with dev or production data.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Browser hardening. Admin and API can never be framed (clickjacking); public pages only by themselves;
  // /embed is the one place other sites may frame (the shareable form). A full CSP arrives with the consent work.
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ];
    return [
      { source: "/:path*", headers: base },
      { source: "/admin/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }, { key: "X-Frame-Options", value: "DENY" }] },
      { source: "/((?!admin|api|embed|_next).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] },
    ];
  },
};

export default nextConfig;
