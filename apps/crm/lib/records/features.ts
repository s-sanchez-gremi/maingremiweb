// Features every engine record gets for free: notes, private file attachments, change history and "linked records" (two-way links).
import { and, desc, eq, isNull, count } from "drizzle-orm";
import { db } from "@apex/db";
import { recordFiles, recordHistory, recordNotes } from "@apex/db/schema";
import { classifyUpload, safeName } from "@apex/core/files";
import { deletePrivatePrefix, putPrivate } from "@apex/core/storage";
import type { Entity } from "./entity";
import { ENTITIES } from "./registry";

export const MAX_FILE = 10 * 1024 * 1024;
export class FeatureError extends Error {}

export async function addNote(e: Entity, id: string, body: string, actor: { id: string; email: string }) {
  const text = body.trim();
  if (!text) throw new FeatureError("La nota és buida");
  if (text.length > 4000) throw new FeatureError("La nota és massa llarga (màx. 4000 caràcters)");
  await db.insert(recordNotes).values({ entity: e.key, recordId: id, body: text, authorId: actor.id, authorName: actor.email });
}
export const listNotes = (e: Entity, id: string) => db.select().from(recordNotes).where(and(eq(recordNotes.entity, e.key), eq(recordNotes.recordId, id))).orderBy(desc(recordNotes.createdAt));
export const deleteNote = (e: Entity, id: string, noteId: string) => db.delete(recordNotes).where(and(eq(recordNotes.id, noteId), eq(recordNotes.entity, e.key), eq(recordNotes.recordId, id)));

/** PDF, images, Word or Excel up to 10 MB, type decided from the bytes, stored in the private bucket. */
export async function addFile(e: Entity, id: string, file: File, userId: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = bytes.length > 0 && bytes.length <= MAX_FILE ? classifyUpload(file.name, bytes) : null;
  if (!kind) throw new FeatureError("Fitxer no admès (PDF, imatge, Word o Excel, màx. 10 MB)");
  const key = `records/${e.key}/${id}/${crypto.randomUUID()}.${kind.ext}`;
  await putPrivate(key, bytes, kind.mime);
  await db.insert(recordFiles).values({ entity: e.key, recordId: id, key, name: safeName(file.name), mime: kind.mime, size: bytes.length, uploadedBy: userId });
}
export const listFiles = (e: Entity, id: string) => db.select().from(recordFiles).where(and(eq(recordFiles.entity, e.key), eq(recordFiles.recordId, id))).orderBy(desc(recordFiles.createdAt));
export async function fileOf(e: Entity, id: string, fileId: string) {
  const [f] = await db.select().from(recordFiles).where(and(eq(recordFiles.id, fileId), eq(recordFiles.entity, e.key), eq(recordFiles.recordId, id)));
  return f ?? null;
}
export async function deleteFile(e: Entity, id: string, fileId: string) {
  const f = await fileOf(e, id, fileId);
  if (!f) return;
  await db.delete(recordFiles).where(eq(recordFiles.id, f.id));
  await deletePrivatePrefix(f.key);
}

export const listHistory = (e: Entity, id: string) => db.select().from(recordHistory).where(and(eq(recordHistory.entity, e.key), eq(recordHistory.recordId, id))).orderBy(desc(recordHistory.createdAt)).limit(100);

/** Removes notes, files (database rows and stored objects) and history of a deleted record. */
export async function purgeExtras(entity: string, id: string) {
  await deletePrivatePrefix(`records/${entity}/${id}/`);
  await db.delete(recordFiles).where(and(eq(recordFiles.entity, entity), eq(recordFiles.recordId, id)));
  await db.delete(recordNotes).where(and(eq(recordNotes.entity, entity), eq(recordNotes.recordId, id)));
  await db.delete(recordHistory).where(and(eq(recordHistory.entity, entity), eq(recordHistory.recordId, id)));
}

// ---- two-way links: every relation field in any entity that points at `e` shows up on e's record page ----
export type Linked = { entity: Entity; field: string; label: string; total: number; rows: { id: string; text: string }[] };
export async function linkedRecords(e: Entity, id: string): Promise<Linked[]> {
  const out: Linked[] = [];
  for (const src of Object.values(ENTITIES)) {
    if (src.hidden) continue;
    for (const f of src.fields) {
      if (f.type !== "relation" || f.to !== e.key) continue;
      const t = src.table as unknown as Record<string, never>;
      const conds = [eq(t[f.name], id), ...(src.archivable ? [isNull(t.archivedAt)] : [])];
      const [{ n }] = await db.select({ n: count() }).from(src.table).where(and(...conds));
      if (!Number(n)) continue;
      const rows = (await db.select().from(src.table).where(and(...conds)).limit(8)) as Record<string, unknown>[];
      out.push({ entity: src, field: f.name, label: `${src.title} · ${f.label}`, total: Number(n), rows: rows.map((r) => ({ id: String(r.id), text: src.summary(r) })) });
    }
  }
  return out;
}
