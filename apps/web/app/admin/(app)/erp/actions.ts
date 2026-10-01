"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { requireUser } from "@/lib/auth";
import { ENTITIES, type FieldSpec } from "@/lib/erp-entities";
import { ErpError, generateFees, markPaid, renewSubscription, saveEntry, voidEntry } from "@/lib/erp";
import { classifyUpload, safeName } from "@/lib/forms/files";
import { deletePrivatePrefix, putPrivate } from "@/lib/storage";
import { erpEntries } from "@apex/db/schema";
import { parseEuros } from "@/lib/money";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const uuid = (fd: FormData, k = "id") => z.string().uuid().parse(fd.get(k));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- generic lists ----
function value(f: FieldSpec, fd: FormData): unknown {
  const raw = s(fd, f.name);
  switch (f.kind) {
    case "checkbox": return fd.get(f.name) === "on";
    case "date": return DATE.test(raw) ? raw : null;
    case "euros": { if (!raw) return f.required ? undefined : null; const c = parseEuros(raw); if (c === null) throw new ErpError(`${f.label}: import no vàlid`); return c; }
    case "percent": { const n = Number(raw.replace(",", ".") || "0"); if (!Number.isFinite(n) || n < 0 || n > 100) throw new ErpError(`${f.label}: percentatge no vàlid`); return Math.round(n * 100); }
    case "select": return raw || (f.required ? undefined : null);
    default: return raw.slice(0, f.kind === "textarea" ? 2000 : 200);
  }
}

export async function saveRow(fd: FormData) {
  await requireUser("erp:write");
  const cfg = ENTITIES[s(fd, "entity")];
  if (!cfg) throw new Error("Unknown list");
  const back = `/admin/erp/${cfg.key}`;
  const id = s(fd, "id");
  try {
    const values: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const v = value(f, fd);
      if (f.required && (v === undefined || v === "" || v === null)) throw new ErpError(`${f.label} és obligatori`);
      if (v !== undefined) values[f.name] = v;
    }
    // @ts-expect-error the table comes from the config; the column keys are the field names
    if (id) await db.update(cfg.table).set(values).where(eq(cfg.table.id, z.string().uuid().parse(id)));
    else await db.insert(cfg.table).values(values as never);
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    if (e instanceof ErpError) redirect(`${back}?error=${encodeURIComponent(e.message)}`);
    if (code === "23505") redirect(`${back}?error=${encodeURIComponent("Ja existeix un element amb aquest nom")}`);
    throw e;
  }
  redirect(`${back}?saved=1`);
}

export async function deleteRow(fd: FormData) {
  await requireUser("erp:write");
  const cfg = ENTITIES[s(fd, "entity")];
  if (!cfg) throw new Error("Unknown list");
  // @ts-expect-error see saveRow
  await db.delete(cfg.table).where(eq(cfg.table.id, uuid(fd)));
  redirect(`/admin/erp/${cfg.key}?saved=1`);
}

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

