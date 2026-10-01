// Client portal rules. Plain DB logic (no Next imports) so it is testable. Portal accounts are separate from staff users.
// Nothing here ever returns data of another client: every read starts from the logged-in portal user's client_id.
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, portalSessions, portalTokens, portalUsers, projectDocuments, projects } from "@apex/db/schema";
import { enqueueEmail } from "@apex/core/outbox";
import { MIN_PASSWORD, hashPassword, verifyPassword } from "@apex/core/password";

export class PortalError extends Error {}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const INVITE_MS = 7 * 86400_000, RESET_MS = 3600_000;
const link = (token: string) => `${(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/portal/activate?token=${token}`;

async function newToken(tx: Pick<typeof db, "insert" | "delete">, portalUserId: string, kind: "invite" | "reset", now: Date) {
  const token = randomBytes(32).toString("base64url");
  await tx.delete(portalTokens).where(and(eq(portalTokens.portalUserId, portalUserId), isNull(portalTokens.usedAt))); // only the newest link works
  await tx.insert(portalTokens).values({ tokenHash: sha(token), portalUserId, kind, expiresAt: new Date(now.getTime() + (kind === "invite" ? INVITE_MS : RESET_MS)) });
  return token;
}

/** Staff: give a client's contact person access. Re-inviting the same address just sends a fresh link. */
export async function invite(clientId: string, email: string, name: string, now = new Date()) {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new PortalError("Correu electrònic no vàlid");
  return db.transaction(async (tx) => {
    const [client] = await tx.select().from(clients).where(eq(clients.id, clientId));
    if (!client) throw new PortalError("Client no trobat");
    const [existing] = await tx.select().from(portalUsers).where(eq(portalUsers.email, e));
    if (existing && existing.clientId !== clientId) throw new PortalError("Aquest correu ja té accés com a part d'un altre client");
    const [u] = existing ? [existing] : await tx.insert(portalUsers).values({ clientId, email: e, name: name.trim().slice(0, 120) }).returning();
    const token = await newToken(tx, u.id, "invite", now);
    await enqueueEmail(tx, {
      to: e, subject: "Accés al portal de clients",
      text: `Hola${u.name ? ` ${u.name}` : ""},\n\nT'han donat accés al portal de clients de ${client.name}. Crea la teva contrasenya amb aquest enllaç (vàlid 7 dies):\n\n${link(token)}\n\nSi no esperaves aquest correu, ignora'l.`,
    });
    return u.id;
  });
}

/** Visitor: "I forgot my password". Always the same answer; mail only goes to active accounts. */
export async function requestReset(email: string, now = new Date()) {
  const e = email.trim().toLowerCase();
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, e));
  if (!u || u.disabled) return;
  await db.transaction(async (tx) => {
    const token = await newToken(tx, u.id, "reset", now);
    await enqueueEmail(tx, { to: e, subject: "Restableix la contrasenya del portal", text: `Per crear una contrasenya nova, obre aquest enllaç (vàlid 1 hora):\n\n${link(token)}\n\nSi no ho has demanat tu, ignora aquest correu.` });
  });
}

export async function tokenValid(token: string, now = new Date()) {
  const [t] = await db.select().from(portalTokens).where(and(eq(portalTokens.tokenHash, sha(token)), isNull(portalTokens.usedAt), gt(portalTokens.expiresAt, now)));
  return !!t;
}

/** Sets the password from an invitation/reset link. The link dies, and every existing session of that account is closed. */
export async function setPasswordWithToken(token: string, password: string, now = new Date()) {
  if (password.length < MIN_PASSWORD) throw new PortalError(`La contrasenya ha de tenir almenys ${MIN_PASSWORD} caràcters`);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [t] = await tx.update(portalTokens).set({ usedAt: now })
      .where(and(eq(portalTokens.tokenHash, sha(token)), isNull(portalTokens.usedAt), gt(portalTokens.expiresAt, now))).returning();
    if (!t) throw new PortalError("Aquest enllaç no és vàlid o ha caducat");
    const [u] = await tx.select().from(portalUsers).where(eq(portalUsers.id, t.portalUserId));
    if (!u || u.disabled) throw new PortalError("Aquest compte està desactivat");
    await tx.update(portalUsers).set({ passwordHash }).where(eq(portalUsers.id, u.id));
    await tx.delete(portalSessions).where(eq(portalSessions.portalUserId, u.id));
    return u.id;
  });
}

/** Returns the account when email+password are right and the account is active. Same work whether or not the email exists. */
export async function checkLogin(email: string, password: string) {
  const [u] = await db.select().from(portalUsers).where(eq(portalUsers.email, email.trim().toLowerCase()));
  const ok = u?.passwordHash ? await verifyPassword(u.passwordHash, password) : (await hashPassword(password), false); // unknown email costs the same time
  if (!u || !ok || u.disabled) return null;
  await db.update(portalUsers).set({ lastLoginAt: new Date() }).where(eq(portalUsers.id, u.id));
  return u;
}

// ---- staff-side management ----
export const portalUsersOf = (clientId: string) => db.select().from(portalUsers).where(eq(portalUsers.clientId, clientId)).orderBy(asc(portalUsers.email));
export async function setDisabled(id: string, disabled: boolean) {
  await db.update(portalUsers).set({ disabled }).where(eq(portalUsers.id, id));
  if (disabled) await db.delete(portalSessions).where(eq(portalSessions.portalUserId, id)); // takes effect immediately
}
export const removePortalUser = (id: string) => db.delete(portalUsers).where(eq(portalUsers.id, id));
export const setDocumentShared = (id: string, shared: boolean) => db.update(projectDocuments).set({ shared }).where(eq(projectDocuments.id, id));

// ---- what a client may see: their own projects, and only the documents staff shared ----
export const projectsOf = (clientId: string) =>
  db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).where(eq(projects.clientId, clientId)).orderBy(asc(projects.name));

export const sharedDocuments = (clientId: string) =>
  db.select({ d: projectDocuments, projectId: projects.id }).from(projectDocuments)
    .innerJoin(projects, eq(projects.id, projectDocuments.projectId))
    .where(and(eq(projects.clientId, clientId), eq(projectDocuments.shared, true))).orderBy(desc(projectDocuments.createdAt));
