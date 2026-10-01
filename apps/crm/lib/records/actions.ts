"use server";
// Generic save/delete for every engine entity: permission, validation and the redirect back to the list.
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@apex/core/auth";
import { deleteRecord, saveRecord } from "./engine";
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
  await requireUser(e.perm);
  const id = s(fd, "id");
  try {
    await saveRecord(e, id ? z.string().uuid().parse(id) : null, (name) => (fd.has(name) ? String(fd.get(name)) : undefined));
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    if (err instanceof RecordError) redirect(`${e.basePath}?error=${encodeURIComponent(err.message)}`);
    if (code === "23505") redirect(`${e.basePath}?error=${encodeURIComponent("Ja existeix un element amb aquest nom")}`);
    throw err;
  }
  redirect(`${e.basePath}?saved=1`);
}

export async function deleteRecordAction(fd: FormData) {
  const e = entityOf(fd);
  await requireUser(e.perm);
  await deleteRecord(e, z.string().uuid().parse(fd.get("id")));
  redirect(`${e.basePath}?saved=1`);
}
