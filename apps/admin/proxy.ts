// Every response gets a Content-Security-Policy (built per request) and the admin can never be framed.
// There are no language prefixes here: the admin app serves /admin (staff) and /api (media upload, health, cron).
// The content editor frames the website's live preview (/admin/preview), which is served from another origin: the website's host in
// production, its own port in development (WEB_PREVIEW_URL). The CSP of the editor page allows exactly that origin.
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, kindOf } from "@apex/core/csp";

const origin = (u?: string) => { try { return u ? new URL(u).origin : undefined; } catch { return undefined; } };

export function proxy(req: NextRequest) {
  const [, first, second] = req.nextUrl.pathname.split("/");
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", buildCsp(kindOf(first, second), {
    s3Origin: origin(process.env.S3_PUBLIC_URL), previewOrigin: origin(process.env.WEB_PREVIEW_URL),
    dev: process.env.NODE_ENV !== "production", https: (process.env.SITE_URL ?? "").startsWith("https://"),
  }));
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

// Not for static assets or files with an extension.
export const config = { matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"] };
