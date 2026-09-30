// Paths without a language prefix go to the default language (/about → /ca/about). Files, /admin and /api are untouched.
import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["ca", "es", "en"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LOCALES.includes(pathname.split("/")[1])) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/ca${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: ["/((?!admin|api|_next|.*\\..*).*)"] };
