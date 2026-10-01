"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@apex/core/auth";
import { ErpError, generateFees, markPaid, renewSubscription, saveEntry, voidEntry } from "@/lib/erp";
import { classifyUpload, safeName } from "@apex/core/files";
import { deletePrivatePrefix, putPrivate } from "@apex/core/storage";
import { erpEntries } from "@apex/db/schema";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (fd: FormData, k = "id") => z.string().uuid().parse(fd.get(k));

export async function renewSubscriptionAction(fd: FormData) {
  const user = await requireUser("erp:write");
  await renewSubscription(uuid(fd), user.id);
  redirect("/admin/erp/entries?kind=expense&saved=renewal");
}

// ---- entries ----
export async function saveEntryAction(fd: FormData) {
  const user = await requireUser("erp:write");
  const id = s(fd, "id") || null;
  const kind = s(fd, "kind");
  const back = (q: string) => redirect(id ? `/admin/erp/entries/${id}?${q}` : `/admin/erp/entries/new?kind=${kind}&${q}`);
  let savedId: string;
  try {
    savedId = await saveEntry(id, {
      kind, occurredOn: s(fd, "occurredOn"), description: s(fd, "description"), supplierId: s(fd, "supplierId"), memberId: s(fd, "memberId"), counterparty: s(fd, "counterparty"),
      categoryId: s(fd, "categoryId"), costCenterId: s(fd, "costCenterId"), base: s(fd, "base"), vatBp: Number(s(fd, "vatBp") || 0), docNumber: s(fd, "docNumber"),
      dueOn: s(fd, "dueOn"), paidOn: s(fd, "paidOn"), paymentMethod: s(fd, "paymentMethod"), feePeriod: s(fd, "feePeriod"), notes: s(fd, "notes"),
    }, user.id);
  } catch (e) {
    if (e instanceof ErpError) return back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const kindOk = bytes.length <= 10 * 1024 * 1024 ? classifyUpload(file.name, bytes) : null;
    if (!kindOk) redirect(`/admin/erp/entries/${savedId}?error=${encodeURIComponent("Fitxer no admès (PDF, imatge, Word o Excel, màx. 10 MB)")}`);
    const [old] = await db.select({ k: erpEntries.fileKey }).from(erpEntries).where(eq(erpEntries.id, savedId));
    const key = `erp/${savedId}/${crypto.randomUUID()}.${kindOk.ext}`;
    await putPrivate(key, bytes, kindOk.mime);
    await db.update(erpEntries).set({ fileKey: key, fileName: safeName(file.name) }).where(eq(erpEntries.id, savedId));
    if (old?.k) await deletePrivatePrefix(old.k);
  }
  redirect(`/admin/erp/entries/${savedId}?saved=1`);
}

export async function voidEntryAction(fd: FormData) {
  await requireUser("erp:write");
  const id = uuid(fd);
  const [e] = await db.select({ kind: erpEntries.kind }).from(erpEntries).where(eq(erpEntries.id, id));
  await voidEntry(id);
  redirect(`/admin/erp/entries?kind=${e?.kind ?? "expense"}&saved=void`);
}

export async function markPaidAction(fd: FormData) {
  await requireUser("erp:write");
  const id = uuid(fd);
  try { await markPaid(id, s(fd, "paidOn") || new Date().toISOString().slice(0, 10), s(fd, "method")); }
  catch (e) { if (e instanceof ErpError) redirect(`/admin/erp/entries/${id}?error=${encodeURIComponent(e.message)}`); throw e; }
  redirect(`/admin/erp/entries/${id}?saved=1`);
}

export async function generateFeesAction(fd: FormData) {
  const user = await requireUser("erp:write");
  const period = s(fd, "period");
  try { const n = await generateFees(period, user.id); redirect(`/admin/erp/fees?period=${encodeURIComponent(period)}&created=${n}`); }
  catch (e) { if (e instanceof ErpError) redirect(`/admin/erp/fees?error=${encodeURIComponent(e.message)}`); throw e; }
}

