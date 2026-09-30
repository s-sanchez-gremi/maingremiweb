// Project manager: tasks and documents per project. Plain DB/storage logic (no Next imports) so it is testable.
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { projectDocuments, projects, tasks, users } from "@/db/schema";
import { classifyUpload, safeName } from "./forms/files";
import { deletePrivatePrefix, putPrivate } from "./storage";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export class ProjectError extends Error {}

// ---- tasks ----
export async function addTask(projectId: string, title: string, ownerId: string | null, dueDate: string | null) {
  const t = title.trim().slice(0, 200);
  if (!t) throw new ProjectError("Indica el títol de la tasca");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ProjectError("Data no vàlida");
  await db.insert(tasks).values({ projectId, title: t, ownerId, dueDate: dueDate || null });
}
export const setTaskDone = (id: string, done: boolean) => db.update(tasks).set({ doneAt: done ? new Date() : null }).where(eq(tasks.id, id));
export const deleteTask = (id: string) => db.delete(tasks).where(eq(tasks.id, id));

/** Open tasks first (soonest due first, undated last), then finished ones. */
export function listTasks(f: { projectId?: string; ownerId?: string; openOnly?: boolean }) {
  return db.select({ t: tasks, project: projects.name, owner: users.email }).from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId)).leftJoin(users, eq(users.id, tasks.ownerId))
    .where(and(f.projectId ? eq(tasks.projectId, f.projectId) : undefined, f.ownerId ? eq(tasks.ownerId, f.ownerId) : undefined, f.openOnly ? isNull(tasks.doneAt) : undefined))
    .orderBy(sql`${tasks.doneAt} is not null`, sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt)).limit(300);
}
export const isOverdue = (dueDate: string | null, doneAt: Date | null, today = new Date().toISOString().slice(0, 10)) => !!dueDate && !doneAt && dueDate < today;

// ---- documents ----
export async function addLink(projectId: string, userId: string, title: string, url: string) {
  let u: URL;
  try { u = new URL(url.trim()); } catch { throw new ProjectError("Enllaç no vàlid"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ProjectError("Només s'admeten enllaços http(s)");
  await db.insert(projectDocuments).values({ projectId, kind: "link", title: (title.trim() || u.hostname).slice(0, 200), url: u.toString(), createdBy: userId });
}

export async function addFile(projectId: string, userId: string, title: string, up: { name: string; bytes: Buffer }) {
  if (!up.bytes.length) throw new ProjectError("Tria un fitxer");
  if (up.bytes.length > MAX_DOC_BYTES) throw new ProjectError("El fitxer supera els 10 MB");
  const kind = classifyUpload(up.name, up.bytes); // decided from the bytes, never the browser's claim
  if (!kind) throw new ProjectError("Format no admès (PDF, imatge, Word o Excel)");
  const id = randomUUID(), key = `projects/${projectId}/${id}.${kind.ext}`;
  await putPrivate(key, up.bytes, kind.mime);
  const name = safeName(up.name);
  try {
    await db.insert(projectDocuments).values({ id, projectId, kind: "file", title: (title.trim() || name).slice(0, 200), fileKey: key, fileName: name, mime: kind.mime, size: up.bytes.length, createdBy: userId });
  } catch (e) { await deletePrivatePrefix(key); throw e; } // no orphan object if the record could not be written
}

export async function deleteDocument(id: string) {
  const [d] = await db.delete(projectDocuments).where(eq(projectDocuments.id, id)).returning();
  if (d?.fileKey) await deletePrivatePrefix(d.fileKey);
}

/** Deleting a project also removes its stored files (the rows go with it by cascade). */
export async function deleteProject(id: string) {
  await deletePrivatePrefix(`projects/${id}/`);
  await db.delete(projects).where(eq(projects.id, id));
}
