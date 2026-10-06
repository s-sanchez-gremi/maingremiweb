// User management rules. Pure DB logic (no Next imports); actions in apps/admin/app/admin/(app)/users call these.
import { and, count, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { sessions, users } from "@apex/db/schema";
import { MIN_PASSWORD, hashPassword, verifyPassword } from "./password";
import type { Role } from "./permissions";

export class UserError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new UserError(`La contrasenya ha de tenir almenys ${MIN_PASSWORD} caràcters`);
}

async function adminCount() {
  const [r] = await db.select({ n: count() }).from(users).where(eq(users.role, "admin"));
  return r.n;
}

export async function createUser(input: { email: string; name: string; role: Role; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new UserError("Correu electrònic no vàlid");
  if (!["admin", "editor"].includes(input.role)) throw new UserError("Rol no vàlid");
  checkPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  try {
    const [u] = await db.insert(users).values({ email, name: input.name.trim(), role: input.role, passwordHash }).returning({ id: users.id });
    return u.id;
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") throw new UserError("Ja existeix un usuari amb aquest correu");
    throw e;
  }
}

export async function setRole(actorId: string, targetId: string, role: Role) {
  if (!["admin", "editor"].includes(role)) throw new UserError("Rol no vàlid");
  const [t] = await db.select().from(users).where(eq(users.id, targetId));
  if (!t) throw new UserError("Usuari no trobat");
  if (t.role === "admin" && role !== "admin") {
    if (actorId === targetId) throw new UserError("No et pots treure a tu mateix el rol d'administrador");
    if ((await adminCount()) <= 1) throw new UserError("Ha de quedar almenys un administrador");
  }
  await db.update(users).set({ role }).where(eq(users.id, targetId));
  await db.delete(sessions).where(eq(sessions.userId, targetId)); // permissions changed: force a fresh login
}

/** Admin sets a new password for someone else. Signs them out everywhere. */
export async function resetPassword(targetId: string, password: string) {
  checkPassword(password);
  const [u] = await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, targetId)).returning({ id: users.id });
  if (!u) throw new UserError("Usuari no trobat");
  await db.delete(sessions).where(eq(sessions.userId, targetId));
}

/** A user changes their own password (needs the current one). Signs them out everywhere. */
export async function changeOwnPassword(userId: string, current: string, next: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(u.passwordHash, current))) throw new UserError("La contrasenya actual no és correcta");
  checkPassword(next);
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new UserError("No et pots eliminar a tu mateix");
  const [t] = await db.select().from(users).where(eq(users.id, targetId));
  if (!t) return;
  if (t.role === "admin" && (await adminCount()) <= 1) throw new UserError("Ha de quedar almenys un administrador");
  await db.delete(users).where(and(eq(users.id, targetId))); // sessions cascade; authored entries keep existing (author set null)
}
