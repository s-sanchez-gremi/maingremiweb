// Answers the staff bar on public pages (lib/admin-bar.ts). Under /admin so the edge lock (ADMIN_ALLOWED_IPS) covers it.
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";
import { entryForPath } from "@/lib/admin-bar";
import { adminUrl } from "@/lib/admin-url";

export const dynamic = "force-dynamic";
const cookieDomain = () => process.env.SESSION_COOKIE_DOMAIN || null;

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const user = await getUser();
  if (!user) return NextResponse.json({ signedIn: false, cookieDomain: cookieDomain() }, { status: 401, headers });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const entry = can(user, "content:write") && path.startsWith("/") ? await entryForPath(path.slice(0, 300)) : null;
  return NextResponse.json({ signedIn: true, email: user.email, canWrite: can(user, "content:write"), adminUrl: adminUrl(), cookieDomain: cookieDomain(), entry }, { headers });
}
