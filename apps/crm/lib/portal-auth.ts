// Portal sessions: their own cookie and table, so a staff session is never a portal session and vice versa.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@apex/db";
import { portalSessions, portalUsers } from "@apex/db/schema";

const COOKIE = "apex_portal";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createPortalSession(portalUserId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(portalSessions).values({ id: sha(token), portalUserId, expiresAt });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/portal", expires: expiresAt });
}

export async function getPortalUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ user: portalUsers }).from(portalSessions)
    .innerJoin(portalUsers, eq(portalUsers.id, portalSessions.portalUserId))
    .where(and(eq(portalSessions.id, sha(token)), gt(portalSessions.expiresAt, new Date()), eq(portalUsers.disabled, false)));
  return row?.user ?? null;
}

export async function requirePortalUser() {
  const u = await getPortalUser();
  if (!u) redirect("/portal/login");
  return u;
}

export async function destroyPortalSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(portalSessions).where(eq(portalSessions.id, sha(token)));
  jar.delete({ name: COOKIE, path: "/portal" });
}
