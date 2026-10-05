"use server";
// Generic save/delete for every engine entity: permission, validation and the redirect back to where the person was
// (the admin pages or the workspace; `back` is only honoured when it points into this entity's own screens).
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@apex/db";
import { classifyUpload } from "@apex/core/files";
import { deletePrivatePrefix, putPrivate } from "@apex/core/storage";
import { requireUser } from "@apex/core/auth";
import { deleteRecord, saveField, saveRecord, setArchived } from "./engine";
import type { Entity } from "./entity";
import { addFile, addNote, deleteFile, deleteNote, FeatureError } from "./features";
import { RecordError } from "./fieldTypes";
import { screenEntity } from "./registry";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function entityOf(fd: FormData) {
  const e = screenEntity(s(fd, "entity"));
  if (!e) throw new Error("Unknown list");
  return e;
}


const ws = (e: Entity) => `/workspace/${e.key}`;
/** Where to return to: the entity's own pages in the admin or in the workspace; anything else falls back to `fallback`. */
function backTo(e: Entity, fd: FormData, fallback: string) {
  const b = s(fd, "back");
  const ok = [e.basePath, ws(e)].some((p) => b === p || b.startsWith(`${p}/`) || b.startsWith(`${p}?`));
  return ok && !b.includes("//") ? b : fallback;
}
const homeOf = (e: Entity, fd: FormData) => (s(fd, "back").startsWith(ws(e)) ? ws(e) : e.basePath);
const go = (to: string, params: Record<string, string>): never => {
  const u = new URL(to, "http://x");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  redirect(u.pathname + u.search);
};

export async function saveRecordAction(fd: FormData) {
  const e = entityOf(fd);
  const user = await requireUser(e.perm);
  const id = s(fd, "id");
  const back = backTo(e, fd, e.basePath);
  let savedId = id;
  try {
    savedId = await saveRecord(e, id ? z.string().uuid().parse(id) : null, (name) => (fd.has(name) ? String(fd.get(name)) : undefined), user);
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    if (err instanceof RecordError) go(back, { error: err.message });
    if (code === "23505") go(back, { error: "Ja existeix un registre amb aquest valor (nom o NIF/CIF)" });
    throw err;
  }
  // a record created in the workspace opens in the side panel right away
  if (!id && back.startsWith(ws(e))) go(ws(e), { open: savedId, saved: "1" });
  go(back, { saved: "1" });
}

/** One cell edited in place in the workspace table. Returns the outcome instead of redirecting. */
export async function saveCellAction(entity: string, id: string, field: string, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = screenEntity(entity);
  if (!e) return { ok: false, error: "Llista desconeguda" };
  const user = await requireUser(e.perm);
  try { await saveField(e, z.string().uuid().parse(id), field, raw, user); return { ok: true }; }
  catch (err) {
    if (err instanceof RecordError) return { ok: false, error: err.message };
    if ((err as { cause?: { code?: string } }).cause?.code === "23505") return { ok: false, error: "Ja existeix un registre amb aquest valor (nom o NIF/CIF)" };
    throw err;
  }
}

export async function deleteRecordAction(fd: FormData) {
  const e = entityOf(fd);
  await requireUser(e.perm);
  await deleteRecord(e, z.string().uuid().parse(fd.get("id")));
  go(homeOf(e, fd), { saved: "1" });
}

// ---- record page: notes, files, archive ----
const recordOf = (fd: FormData) => {
  const e = entityOf(fd);
  const id = z.string().uuid().parse(fd.get("id"));
  return { e, id, page: backTo(e, fd, `${e.basePath}/${id}`), home: homeOf(e, fd) };
};
const fail = (page: string, err: unknown): never => {
  if (err instanceof FeatureError) go(page, { error: err.message });
  throw err;
};

export async function addNoteAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  const user = await requireUser(e.perm);
  try { await addNote(e, id, s(fd, "body"), user); } catch (err) { fail(page, err); }
  go(page, { saved: "1" });
}
export async function deleteNoteAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  await requireUser(e.perm);
  await deleteNote(e, id, z.string().uuid().parse(fd.get("noteId")));
  go(page, { saved: "1" });
}
export async function uploadFileAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  const user = await requireUser(e.perm);
  const file = fd.get("file");
  try {
    if (!(file instanceof File) || file.size === 0) throw new FeatureError("Tria un fitxer");
    await addFile(e, id, file, user.id);
  } catch (err) { fail(page, err); }
  go(page, { saved: "1" });
}
export async function deleteFileAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  await requireUser(e.perm);
  await deleteFile(e, id, z.string().uuid().parse(fd.get("fileId")));
  go(page, { saved: "1" });
}
export async function archiveAction(fd: FormData) {
  const { e, page, id, home } = recordOf(fd);
  const user = await requireUser(e.perm);
  const archive = fd.get("archive") === "1";
  try { await setArchived(e, id, archive, user); }
  catch (err) { if (err instanceof RecordError) notFound(); throw err; }
  go(archive ? home : page, { saved: "1" });
}

/** Sets the record's logo from an uploaded PNG, JPEG, WebP or GIF (up to 5 MB): checked by content, shrunk to a small WebP, kept privately. */
export async function uploadLogoAction(fd: FormData) {
  const e = entityOf(fd);
  await requireUser(e.perm);
  const id = z.string().uuid().parse(s(fd, "id"));
  const back = backTo(e, fd, `${ws(e)}?open=${id}`);
  if (!e.logo) throw new Error("This list has no logos");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return go(back, { error: "Tria una imatge" });
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = bytes.length <= 5 * 1024 * 1024 ? classifyUpload(file.name, bytes) : null;
  if (!kind || !kind.mime.startsWith("image/")) return go(back, { error: "El logotip ha de ser una imatge PNG, JPG, WebP o GIF de com a màxim 5 MB" });
  let webp: Buffer;
  try { webp = await sharp(bytes, { failOn: "none" }).rotate().resize(160, 160, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); }
  catch { return go(back, { error: "No s'ha pogut llegir la imatge" }); }
  const key = `records/${e.key}/${id}/logo.webp`;
  await putPrivate(key, webp, "image/webp");
  await db.update(e.table).set({ [e.logo]: key } as never).where(eq((e.table as unknown as Record<string, never>).id, id));
  go(back, { saved: "1" });
}

export async function removeLogoAction(fd: FormData) {
  const e = entityOf(fd);
  await requireUser(e.perm);
  const id = z.string().uuid().parse(s(fd, "id"));
  const back = backTo(e, fd, `${ws(e)}?open=${id}`);
  if (!e.logo) throw new Error("This list has no logos");
  await deletePrivatePrefix(`records/${e.key}/${id}/logo`);
  await db.update(e.table).set({ [e.logo]: null } as never).where(eq((e.table as unknown as Record<string, never>).id, id));
  go(back, { saved: "1" });
}
