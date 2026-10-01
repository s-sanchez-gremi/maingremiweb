"use server";
// Generic save/delete for every engine entity: permission, validation and the redirect back to the list.
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@apex/core/auth";
import { deleteRecord, saveRecord, setArchived } from "./engine";
import { addFile, addNote, deleteFile, deleteNote, FeatureError } from "./features";
import { RecordError } from "./fieldTypes";
import { screenEntity } from "./registry";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function entityOf(fd: FormData) {
  const e = screenEntity(s(fd, "entity"));
  if (!e) throw new Error("Unknown list");
  return e;
}

export async function saveRecordAction(fd: FormData) {
  const e = entityOf(fd);
  const user = await requireUser(e.perm);
  const id = s(fd, "id");
  const back = s(fd, "back").startsWith(`${e.basePath}/`) ? s(fd, "back") : e.basePath; // only back to this entity's own pages
  try {
    await saveRecord(e, id ? z.string().uuid().parse(id) : null, (name) => (fd.has(name) ? String(fd.get(name)) : undefined), user);
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    if (err instanceof RecordError) redirect(`${back}?error=${encodeURIComponent(err.message)}`);
    if (code === "23505") redirect(`${back}?error=${encodeURIComponent("Ja existeix un element amb aquest nom")}`);
    throw err;
  }
  redirect(`${back}?saved=1`);
}

export async function deleteRecordAction(fd: FormData) {
  const e = entityOf(fd);
  await requireUser(e.perm);
  await deleteRecord(e, z.string().uuid().parse(fd.get("id")));
  redirect(`${e.basePath}?saved=1`);
}

// ---- record page: notes, files, archive ----
const recordOf = (fd: FormData) => { const e = entityOf(fd); return { e, id: z.string().uuid().parse(fd.get("id")), page: `${e.basePath}/${z.string().uuid().parse(fd.get("id"))}` }; };
const fail = (page: string, err: unknown): never => {
  if (err instanceof FeatureError) redirect(`${page}?error=${encodeURIComponent(err.message)}`);
  throw err;
};

export async function addNoteAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  const user = await requireUser(e.perm);
  try { await addNote(e, id, s(fd, "body"), user); } catch (err) { fail(page, err); }
  redirect(`${page}?saved=1`);
}
export async function deleteNoteAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  await requireUser(e.perm);
  await deleteNote(e, id, z.string().uuid().parse(fd.get("noteId")));
  redirect(`${page}?saved=1`);
}
export async function uploadFileAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  const user = await requireUser(e.perm);
  const file = fd.get("file");
  try {
    if (!(file instanceof File) || file.size === 0) throw new FeatureError("Tria un fitxer");
    await addFile(e, id, file, user.id);
  } catch (err) { fail(page, err); }
  redirect(`${page}?saved=1`);
}
export async function deleteFileAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  await requireUser(e.perm);
  await deleteFile(e, id, z.string().uuid().parse(fd.get("fileId")));
  redirect(`${page}?saved=1`);
}
export async function archiveAction(fd: FormData) {
  const { e, id, page } = recordOf(fd);
  const user = await requireUser(e.perm);
  const archive = fd.get("archive") === "1";
  await setArchived(e, id, archive, user);
  redirect(archive ? `${e.basePath}?saved=1` : `${page}?saved=1`);
}
