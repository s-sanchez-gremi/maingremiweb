// 1) Paths without a language prefix go to the default language (/about → /ca/about).
// 2) Every page and API response gets a Content-Security-Policy (built at request time from the environment).
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, kindOf } from "@/lib/csp";

const LOCALES = ["ca", "es", "en"];
const KNOWN = ["admin", "api", "embed", "styleguide"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1];
  if (!LOCALES.includes(first) && !KNOWN.includes(first)) {
    const url = req.nextUrl.clone();
    url.pathname = `/ca${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url, 307);
  }
  const res = NextResponse.next();
  let s3Origin: string | undefined;
  try { s3Origin = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).origin : undefined; } catch { /* misconfigured: images from S3 will be blocked visibly */ }
  res.headers.set("Content-Security-Policy", buildCsp(kindOf(first), {
    s3Origin, dev: process.env.NODE_ENV !== "production", https: (process.env.SITE_URL ?? "").startsWith("https://"),
  }));
  if (first === "admin" || first === "api") res.headers.set("X-Frame-Options", "DENY");
  return res;
}

// Not for static assets or files with an extension (robots.txt, sitemap.xml, favicon, images).
export const config = { matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"] };
