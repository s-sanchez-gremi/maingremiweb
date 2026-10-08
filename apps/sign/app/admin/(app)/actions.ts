"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@apex/core/auth";
import { parseBox } from "@apex/sign/geometry";
import {
  SignError, addField, addSigner, createDraft, deleteDraft, moveSigner, removeField, removeSigner, renameDocument, updateSettings,
} from "@/lib/requests";
import { sendRequest, voidRequest } from "@/lib/lifecycle";
import { retrySeal } from "@/lib/sealing";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (fd: FormData, k = "id") => z.string().uuid().parse(fd.get(k));
const page = (id: string) => `/admin/requests/${id}`;

/** A mistake the person can fix goes back to the page with its message; anything else is a bug and is left to the error log. */
function fail(to: string, e: unknown): never {
  if (!(e instanceof SignError)) throw e;
  redirect(`${to}?error=${encodeURIComponent(e.message)}`);
}

export async function createRequest(fd: FormData) {
  const user = await requireUser("sign:write");
  const file = fd.get("file");
  let id: string;
  try {
    if (!(file instanceof File) || !file.size) throw new SignError("Tria un fitxer PDF.");
    id = await createDraft(user.id, s(fd, "title"), { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  } catch (e) { return fail("/admin", e); }
  redirect(`${page(id)}?saved=created`);
}

export async function saveSettings(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try {
    await renameDocument(id, s(fd, "title"));
    await updateSettings(id, { locale: s(fd, "locale"), message: s(fd, "message"), expiresOn: s(fd, "expiresOn"), ordered: fd.get("ordered") === "1" });
  } catch (e) { fail(to, e); }
  redirect(`${to}?saved=settings`);
}

export async function createSigner(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await addSigner(id, s(fd, "name"), s(fd, "email")); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=signer`);
}

export async function deleteSigner(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await removeSigner(id, uuid(fd, "signerId")); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=signer`);
}

export async function shiftSigner(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await moveSigner(id, uuid(fd, "signerId"), fd.get("dir") === "up" ? -1 : 1); } catch (e) { fail(to, e); }
  redirect(`${to}#signers`);
}

export async function createField(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try {
    const box = parseBox({ x: fd.get("x"), y: fd.get("y"), w: fd.get("w"), h: fd.get("h") });
    if (!box) throw new SignError("El camp ha de ser dins de la pàgina: revisa la posició i la mida.");
    await addField(id, { signerId: uuid(fd, "signerId"), kind: s(fd, "kind"), page: Number(s(fd, "page")), box, required: fd.get("required") === "1" });
  } catch (e) { fail(to, e); }
  redirect(`${to}?saved=field&page=${encodeURIComponent(s(fd, "page"))}#fields`);
}

export async function deleteField(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await removeField(id, uuid(fd, "fieldId")); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=field#fields`);
}

export async function removeRequest(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd);
  try { await deleteDraft(id); } catch (e) { fail(page(id), e); }
  redirect("/admin?deleted=1");
}

export async function submitRequest(fd: FormData) {
  const user = await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await sendRequest(user.id, id); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=sent`);
}

export async function cancelRequest(fd: FormData) {
  const user = await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  try { await voidRequest(user.id, id); } catch (e) { fail(to, e); }
  redirect(`${to}?saved=voided`);
}

export async function retryRequestSeal(fd: FormData) {
  await requireUser("sign:write");
  const id = uuid(fd), to = page(id);
  let result: "sealed" | "already" | "failed";
  try { result = await retrySeal(id); } catch (e) { return fail(to, e); }
  redirect(`${to}?saved=${result === "failed" ? "sealfailed" : "sealed"}`);
}
