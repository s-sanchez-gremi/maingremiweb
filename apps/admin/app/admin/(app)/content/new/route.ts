// "+ Nova pàgina" / "+ Nou article" in the website's staff bar: a plain form POST from a public page (the website cannot call
// this app's server actions). Safe against forged requests because the session cookie is SameSite=Lax (not sent on a cross-site
// POST) and the Origin must be this app or the website. Creates an empty draft and sends the person into its editor.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@apex/db";
import { entries, entryTranslations } from "@apex/db/schema";
import { getUser } from "@apex/core/auth";
import { can } from "@apex/core/permissions";

export const dynamic = "force-dynamic";

const origin = (u?: string) => { try { return u ? new URL(u).origin : null; } catch { return null; } };

export async function POST(req: NextRequest) {
  const allowed = [req.nextUrl.origin, origin(process.env.SITE_URL), origin(process.env.WEB_PREVIEW_URL)].filter(Boolean);
  const from = req.headers.get("origin");
  if (from && !allowed.includes(from)) return new NextResponse("Forbidden", { status: 403 });
  const user = await getUser();
  if (!user || !can(user, "content:write")) return new NextResponse("Forbidden", { status: 403 });
  const type = (await req.formData()).get("type") === "page" ? "page" : "post";
  const [e] = await db.insert(entries).values({ type, authorId: user.id }).returning();
  await db.insert(entryTranslations).values({ entryId: e.id, locale: "ca", slug: `nou-${e.id.slice(0, 8)}` });
  return NextResponse.redirect(new URL(`/admin/content/${e.id}?locale=ca`, req.nextUrl.origin), 303);
}
