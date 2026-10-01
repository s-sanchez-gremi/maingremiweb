"use server";
// Generic save/delete for every engine entity: permission, validation and the redirect back to where the person was
// (the admin pages or the workspace; `back` is only honoured when it points into this entity's own screens).
import { redirect } from "next/navigation";
import { z } from "zod";
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
    if (code === "23505") go(back, { error: "Ja existeix un element amb aquest nom" });
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
    if ((err as { cause?: { code?: string } }).cause?.code === "23505") return { ok: false, error: "Ja existeix un element amb aquest nom" };
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
  await setArchived(e, id, archive, user);
  go(archive ? home : page, { saved: "1" });
}
