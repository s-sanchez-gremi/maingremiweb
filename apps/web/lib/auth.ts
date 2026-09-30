// Email + password, argon2id, server-side sessions. CSRF: sessions use SameSite=Lax httpOnly cookies and
// all mutations are Server Actions, which Next.js protects with an Origin check.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "@/db/schema";
import { can, type Action } from "./permissions";

const COOKIE = "apex_session";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export { hashPassword, verifyPassword } from "./password";

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.insert(sessions).values({ id: sha(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
}

export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sha(token)));
  if (!row || row.expiresAt < new Date()) return null;
  return row.user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete(COOKIE);
}

/** For pages and actions: returns the user or redirects to login / throws if not permitted. */
export async function requireUser(action?: Action) {
  const user = await getUser();
  if (!user) redirect("/admin/login");
  if (action && !can(user, action)) throw new Error("Forbidden");
  return user;
}

// Login throttle: 5 failures per email per 15 min (in-memory; fine for a single instance).
const fails = new Map<string, { n: number; until: number }>();
export function loginBlocked(email: string) {
  const f = fails.get(email);
  return !!f && f.n >= 5 && f.until > Date.now();
}
export function loginFailed(email: string) {
  const f = fails.get(email);
  if (!f || f.until < Date.now()) fails.set(email, { n: 1, until: Date.now() + 15 * 60 * 1000 });
  else f.n++;
}
export const loginSucceeded = (email: string) => fails.delete(email);
