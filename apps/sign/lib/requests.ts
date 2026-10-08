// Signature requests while they are DRAFTS: upload the PDF, add signers, place fields, check, delete. Plain DB/storage logic (no Next
// imports) so it is testable. Every write locks the request row and refuses anything but a draft: once a request is sent, what the
// signers were shown must not change (sending, signing and sealing arrive in steps S3 and S4).
import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { signDocuments, signEvents, signFields, signRequests, signSigners } from "@apex/db/schema";
import { safeName } from "@apex/core/files";
import { deletePrivatePrefix, putPrivate } from "@apex/core/storage";
import { FIELD_KINDS, inBounds, type Box, type FieldKind } from "@apex/sign/geometry";
import { inspectPdf, PDF_PROBLEM_TEXT } from "@apex/sign/pdf";
import { isEditable } from "@apex/sign/state";
import { endOfDayMadrid } from "@apex/sign/time";
import { DEFAULT_EXPIRY_DAYS, MAX_FIELDS, MAX_SIGNERS, isEmail, normalizeEmail, validateRequest } from "@apex/sign/validate";

/** A mistake the person can fix; the message is shown as it is. Anything else is a bug and surfaces as an error. */
export class SignError extends Error {}

const DAY = 86_400_000;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockDraft(tx: Tx, requestId: string) {
  const [r] = await tx.select().from(signRequests).where(eq(signRequests.id, requestId)).for("update");
  if (!r) throw new SignError("La sol·licitud no existeix.");
  if (!isEditable(r.status)) throw new SignError("Només es pot modificar un esborrany.");
  return r;
}

const isUniqueViolation = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
};

// ---- create ----
export async function createDraft(userId: string, title: string, up: { name: string; bytes: Buffer }): Promise<string> {
  if (!up.bytes.length) throw new SignError("Tria un fitxer PDF.");
  const res = await inspectPdf(up.bytes); // the type comes from the bytes, never from the name or the browser
  if (!res.ok) throw new SignError(PDF_PROBLEM_TEXT[res.problem]);
  const info = res.info;
  const docId = randomUUID(), key = `sign/${docId}/original.pdf`, name = safeName(up.name);
  const t = (title.trim() || name.replace(/\.pdf$/i, "")).slice(0, 200) || "Document";
  await putPrivate(key, up.bytes, "application/pdf");
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(signDocuments).values({ id: docId, title: t, fileKey: key, fileName: name, size: up.bytes.length, sha256: info.sha256, pageCount: info.pageCount, pages: info.pages, createdBy: userId });
      const [r] = await tx.insert(signRequests).values({ documentId: docId, createdBy: userId, expiresAt: new Date(Date.now() + DEFAULT_EXPIRY_DAYS * DAY) }).returning({ id: signRequests.id });
      await tx.insert(signEvents).values({ requestId: r.id, kind: "created", detail: { by: userId, sha256: info.sha256 } });
      return r.id;
    });
  } catch (e) {
    await deletePrivatePrefix(`sign/${docId}/`); // no orphan file if the records could not be written
    throw e;
  }
}

// ---- read ----
export async function listRequests() {
  return db.select({
    id: signRequests.id, status: signRequests.status, title: signDocuments.title, createdAt: signRequests.createdAt, expiresAt: signRequests.expiresAt,
    signers: sql<number>`(select count(*)::int from ${signSigners} where ${signSigners.requestId} = ${signRequests.id})`,
    signed: sql<number>`(select count(*)::int from ${signSigners} where ${signSigners.requestId} = ${signRequests.id} and ${signSigners.status} = 'signed')`,
  }).from(signRequests).innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId)).orderBy(desc(signRequests.createdAt)).limit(100);
}

/** The audit trail of a request, oldest first, with the signer's name. */
export async function listEvents(requestId: string) {
  return db.select({ id: signEvents.id, kind: signEvents.kind, at: signEvents.at, detail: signEvents.detail, signer: signSigners.name }).from(signEvents)
    .leftJoin(signSigners, eq(signSigners.id, signEvents.signerId)).where(eq(signEvents.requestId, requestId)).orderBy(asc(signEvents.at), asc(signEvents.id));
}

export async function getRequest(id: string) {
  const [row] = await db.select({ request: signRequests, document: signDocuments }).from(signRequests)
    .innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId)).where(eq(signRequests.id, id));
  if (!row) return null;
  const [signers, fields] = await Promise.all([
    db.select().from(signSigners).where(eq(signSigners.requestId, id)).orderBy(asc(signSigners.position), asc(signSigners.createdAt)),
    db.select().from(signFields).where(eq(signFields.requestId, id)).orderBy(asc(signFields.page), asc(signFields.y), asc(signFields.x)),
  ]);
  return { ...row, signers, fields };
}

/** What still blocks sending (empty = ready). Pure validation of what is stored. */
export async function checkRequest(id: string) {
  const r = await getRequest(id);
  if (!r) throw new SignError("La sol·licitud no existeix.");
  return validateRequest({
    pageCount: r.document.pageCount, expiresAt: r.request.expiresAt,
    signers: r.signers.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    fields: r.fields.map((f) => ({ id: f.id, signerId: f.signerId, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, required: f.required })),
  });
}

// ---- settings ----
export async function updateSettings(id: string, v: { locale: string; message: string; expiresOn: string; ordered: boolean }) {
  if (!["ca", "es", "en"].includes(v.locale)) throw new SignError("Idioma no vàlid.");
  const expiresAt = endOfDayMadrid(v.expiresOn);
  if (!expiresAt) throw new SignError("Data de caducitat no vàlida.");
  await db.transaction(async (tx) => {
    await lockDraft(tx, id);
    await tx.update(signRequests).set({ locale: v.locale as "ca" | "es" | "en", message: v.message.trim().slice(0, 2000), expiresAt, ordered: v.ordered }).where(eq(signRequests.id, id));
  });
}

export async function renameDocument(id: string, title: string) {
  const t = title.trim().slice(0, 200);
  if (!t) throw new SignError("Indica el títol del document.");
  await db.transaction(async (tx) => {
    const r = await lockDraft(tx, id);
    await tx.update(signDocuments).set({ title: t }).where(eq(signDocuments.id, r.documentId));
  });
}

// ---- signers ----
export async function addSigner(id: string, name: string, email: string) {
  const n = name.trim().slice(0, 200), e = normalizeEmail(email);
  if (!n) throw new SignError("Indica el nom del signant.");
  if (!isEmail(e)) throw new SignError("El correu no és vàlid.");
  try {
    await db.transaction(async (tx) => {
      await lockDraft(tx, id);
      const [c] = await tx.select({ n: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${signSigners.position}), 0)::int` }).from(signSigners).where(eq(signSigners.requestId, id));
      if (c.n >= MAX_SIGNERS) throw new SignError(`Com a màxim ${MAX_SIGNERS} signants.`);
      await tx.insert(signSigners).values({ requestId: id, name: n, email: e, position: c.max + 1 });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SignError("Aquest correu ja és a la llista.");
    throw err;
  }
}

export async function removeSigner(id: string, signerId: string) {
  await db.transaction(async (tx) => {
    await lockDraft(tx, id);
    await tx.delete(signSigners).where(sql`${signSigners.id} = ${signerId} and ${signSigners.requestId} = ${id}`); // their fields go with them
  });
}

/** Swaps a signer with the neighbour above (-1) or below (+1) in the signing order. */
export async function moveSigner(id: string, signerId: string, dir: -1 | 1) {
  await db.transaction(async (tx) => {
    await lockDraft(tx, id);
    const list = await tx.select().from(signSigners).where(eq(signSigners.requestId, id)).orderBy(asc(signSigners.position), asc(signSigners.createdAt));
    const i = list.findIndex((s) => s.id === signerId), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) await tx.update(signSigners).set({ position: k + 1 }).where(eq(signSigners.id, list[k].id)); // renumber: never two equal positions
  });
}

// ---- fields ----
export async function addField(id: string, f: { signerId: string; kind: string; page: number; box: Box; required: boolean }) {
  if (!(FIELD_KINDS as string[]).includes(f.kind)) throw new SignError("Tipus de camp desconegut.");
  if (!inBounds(f.box)) throw new SignError("El camp ha de ser dins de la pàgina.");
  await db.transaction(async (tx) => {
    await lockDraft(tx, id);
    const [req] = await tx.select({ pageCount: signDocuments.pageCount }).from(signRequests)
      .innerJoin(signDocuments, eq(signDocuments.id, signRequests.documentId)).where(eq(signRequests.id, id));
    if (!Number.isInteger(f.page) || f.page < 1 || f.page > req.pageCount) throw new SignError("Aquesta pàgina no existeix al document.");
    const [signer] = await tx.select({ id: signSigners.id }).from(signSigners).where(sql`${signSigners.id} = ${f.signerId} and ${signSigners.requestId} = ${id}`);
    if (!signer) throw new SignError("El signant no pertany a aquesta sol·licitud.");
    const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(signFields).where(eq(signFields.requestId, id));
    if (c.n >= MAX_FIELDS) throw new SignError(`Com a màxim ${MAX_FIELDS} camps.`);
    await tx.insert(signFields).values({
      requestId: id, signerId: f.signerId, kind: f.kind as FieldKind, page: f.page, required: f.required,
      x: String(f.box.x), y: String(f.box.y), w: String(f.box.w), h: String(f.box.h),
    });
  });
}

export async function removeField(id: string, fieldId: string) {
  await db.transaction(async (tx) => {
    await lockDraft(tx, id);
    await tx.delete(signFields).where(sql`${signFields.id} = ${fieldId} and ${signFields.requestId} = ${id}`);
  });
}

// ---- delete ----
/** Deleting a draft removes the document, the signers, the fields and the stored file. */
export async function deleteDraft(id: string) {
  const docId = await db.transaction(async (tx) => {
    const r = await lockDraft(tx, id);
    await tx.delete(signDocuments).where(eq(signDocuments.id, r.documentId)); // the request and everything under it cascade
    return r.documentId;
  });
  await deletePrivatePrefix(`sign/${docId}/`);
}
