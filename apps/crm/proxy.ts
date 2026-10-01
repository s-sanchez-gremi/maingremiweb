// Every response gets a Content-Security-Policy (built per request) and the CRM app can never be framed.
// There are no language prefixes here: the CRM app serves /admin (staff), /portal (clients) and /api (forms, health, cron).
import { NextResponse } from "next/server";
import { buildCsp } from "@apex/core/csp";

export function proxy() {
  const res = NextResponse.next();
  let s3Origin: string | undefined;
  try { s3Origin = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : undefined; } catch { /* misconfigured: images from S3 will be blocked visibly */ }
  res.headers.set("Content-Security-Policy", buildCsp("admin", { s3Origin, dev: process.env.NODE_ENV !== "production", https: (process.env.SITE_URL ?? "").startsWith("https://") }));
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

// Not for static assets or files with an extension.
export const config = { matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"] };
