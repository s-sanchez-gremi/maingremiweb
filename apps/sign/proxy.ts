// Every response gets a Content-Security-Policy (built per request) and can never be framed: not the staff screens, not the signer pages.
// The signer pages (/sign/...) are for people with a personal link: never cached, never sent a referrer, never indexed. The PDF itself
// (/sign/<token>/document) gets no CSP: it is not a page, and Chrome's built-in PDF viewer refuses documents served with object-src 'none'.
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@apex/core/csp";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const path = req.nextUrl.pathname;
  const isDocument = /^\/sign\/[^/]+\/document$/.test(path);
  if (!isDocument) {
    let s3Origin: string | undefined;
    try { s3Origin = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : undefined; } catch { /* misconfigured: images from S3 will be blocked visibly */ }
    res.headers.set("Content-Security-Policy", buildCsp("admin", { s3Origin, dev: process.env.NODE_ENV !== "production", https: (process.env.SITE_URL ?? "").startsWith("https://") }));
  }
  res.headers.set("X-Frame-Options", "DENY");
  if (path === "/sign" || path.startsWith("/sign/")) {
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

// Not for static assets or files with an extension.
export const config = { matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"] };
