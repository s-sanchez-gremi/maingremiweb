import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@apex/db";
import { signDocuments, signEvents, signFields, signRequests, signSigners, users } from "@apex/db/schema";
import { getPrivateBytes } from "@apex/core/storage";
import { MAX_FIELDS, MAX_SIGNERS } from "@apex/sign/validate";
import {
  SignError, addField, addSigner, checkRequest, createDraft, deleteDraft, getRequest, listRequests, moveSigner, removeField, removeSigner,
  renameDocument, updateSettings,
} from "@/lib/requests";

let userId = "";
const pdf = async (pages = 2) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
};
const draft = async (title = "Contracte") => createDraft(userId, title, { name: "contracte.pdf", bytes: await pdf() });
const box = { x: 10, y: 80, w: 30, h: 8 };
const refused = async (p: Promise<unknown>) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(SignError); return (e as Error).message; } throw new Error("should have been refused"); };
const names = async (id: string) => (await db.select().from(signSigners).where(eq(signSigners.requestId, id))).sort((a, b) => a.position - b.position).map((s) => s.name);

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: "sign-tests@apex.test", name: "Tests", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  userId = u.id;
});

describe("creating a draft", () => {
  it("stores the exact file privately, records its hash and pages, and starts a draft that expires in 14 days", async () => {
    const bytes = await pdf(3);
    const id = await createDraft(userId, "  Conveni  ", { name: "conveni final.pdf", bytes });
    const r = (await getRequest(id))!;
    expect(r.request).toMatchObject({ status: "draft", locale: "ca", ordered: false, createdBy: userId });
    expect(r.document).toMatchObject({ title: "Conveni", fileName: "conveni final.pdf", size: bytes.length, pageCount: 3 });
    expect(r.document.pages).toHaveLength(3);
    expect(r.document.fileKey).toBe(`sign/${r.document.id}/original.pdf`);
    expect(r.document.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await getPrivateBytes(r.document.fileKey)).equals(bytes)).toBe(true);
    const days = (r.request.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const events = await db.select().from(signEvents).where(eq(signEvents.requestId, id));
    expect(events.map((e) => e.kind)).toEqual(["created"]);
  });

  it("falls back to the file name when no title is given, and lists the request", async () => {
    const id = await createDraft(userId, "   ", { name: "acord-2026.pdf", bytes: await pdf(1) });
    expect((await getRequest(id))!.document.title).toBe("acord-2026");
    const list = await listRequests();
    expect(list.find((x) => x.id === id)).toMatchObject({ status: "draft", signers: 0, signed: 0 });
  });

  it("refuses files that are not usable PDFs and leaves nothing behind", async () => {
    const before = (await db.select().from(signDocuments)).length;
    expect(await refused(createDraft(userId, "x", { name: "a.pdf", bytes: Buffer.alloc(0) }))).toMatch(/fitxer/i);
    expect(await refused(createDraft(userId, "x", { name: "a.pdf", bytes: Buffer.from("no soc un pdf") }))).toMatch(/no és un PDF/);
    expect(await refused(createDraft(userId, "x", { name: "a.pdf", bytes: Buffer.from("%PDF-1.7\n<< /Encrypt 1 0 R >>") }))).toMatch(/xifrat|contrasenya/);
    expect(await refused(createDraft(userId, "x", { name: "a.pdf", bytes: Buffer.concat([await pdf(1), Buffer.from("\n/JavaScript\n")]) }))).toMatch(/scripts/);
    expect((await db.select().from(signDocuments)).length).toBe(before);
  });
});

describe("signers", () => {
  it("adds signers in order, normalising the email, and refuses a repeated or invalid one", async () => {
    const id = await draft();
    await addSigner(id, "  Anna Puig ", " ANNA@Exemple.Test ");
    await addSigner(id, "Biel Roca", "biel@exemple.test");
    const list = (await getRequest(id))!.signers;
    expect(list.map((s) => [s.name, s.email, s.position])).toEqual([["Anna Puig", "anna@exemple.test", 1], ["Biel Roca", "biel@exemple.test", 2]]);
    expect(await refused(addSigner(id, "Altra Anna", "anna@EXEMPLE.test"))).toMatch(/ja és a la llista/);
    expect(await refused(addSigner(id, "X", "no-es-correu"))).toMatch(/correu/);
    expect(await refused(addSigner(id, "  ", "x@exemple.test"))).toMatch(/nom/);
    expect(await names(id)).toEqual(["Anna Puig", "Biel Roca"]);
  });

  it("never lets a request have more signers than the limit, even when they are added at the same moment", async () => {
    const id = await draft();
    const tries = await Promise.allSettled(Array.from({ length: MAX_SIGNERS + 3 }, (_, i) => addSigner(id, `Signant ${i}`, `s${i}@exemple.test`)));
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(MAX_SIGNERS);
    expect(tries.filter((t) => t.status === "rejected").every((t) => (t as PromiseRejectedResult).reason instanceof SignError)).toBe(true);
    expect((await getRequest(id))!.signers).toHaveLength(MAX_SIGNERS);
  });

  it("moves a signer up or down, keeps the positions distinct, and ignores a move past either end", async () => {
    const id = await draft();
    for (const n of ["A", "B", "C"]) await addSigner(id, n, `${n.toLowerCase()}@exemple.test`);
    const [a, , c] = (await getRequest(id))!.signers;
    await moveSigner(id, c.id, -1);
    expect(await names(id)).toEqual(["A", "C", "B"]);
    await moveSigner(id, a.id, -1); // already first
    await moveSigner(id, a.id, 1);
    expect(await names(id)).toEqual(["C", "A", "B"]);
    const positions = (await getRequest(id))!.signers.map((s) => s.position);
    expect(new Set(positions).size).toBe(3);
  });

  it("removes a signer together with their fields, and only from this request", async () => {
    const id = await draft(), other = await draft();
    await addSigner(id, "A", "a@exemple.test");
    await addSigner(other, "B", "b@exemple.test");
    const a = (await getRequest(id))!.signers[0], b = (await getRequest(other))!.signers[0];
    await addField(id, { signerId: a.id, kind: "signature", page: 1, box, required: true });
    await removeSigner(other, a.id); // a signer of another request: nothing happens
    expect((await getRequest(id))!.signers).toHaveLength(1);
    await removeSigner(id, a.id);
    expect((await getRequest(id))!.signers).toHaveLength(0);
    expect((await db.select().from(signFields).where(eq(signFields.requestId, id)))).toHaveLength(0);
    expect((await getRequest(other))!.signers.map((s) => s.id)).toEqual([b.id]);
  });
});

describe("fields", () => {
  it("places a field and returns its numbers exactly", async () => {
    const id = await draft();
    await addSigner(id, "A", "a@exemple.test");
    const s = (await getRequest(id))!.signers[0];
    await addField(id, { signerId: s.id, kind: "signature", page: 2, box: { x: 12.345, y: 80, w: 30, h: 8 }, required: true });
    const [f] = (await getRequest(id))!.fields;
    expect(f).toMatchObject({ kind: "signature", page: 2, required: true, signerId: s.id });
    expect([Number(f.x), Number(f.y), Number(f.w), Number(f.h)]).toEqual([12.345, 80, 30, 8]);
  });

  it("refuses a field outside the page, on a missing page, of an unknown kind, or for a signer of another request", async () => {
    const id = await draft(), other = await draft();
    await addSigner(id, "A", "a@exemple.test");
    await addSigner(other, "B", "b@exemple.test");
    const a = (await getRequest(id))!.signers[0], b = (await getRequest(other))!.signers[0];
    const ok = { signerId: a.id, kind: "signature", page: 1, box, required: true };
    await refused(addField(id, { ...ok, box: { x: 80, y: 80, w: 30, h: 8 } }));
    await refused(addField(id, { ...ok, page: 3 })); // the document has two pages
    await refused(addField(id, { ...ok, page: 0 }));
    await refused(addField(id, { ...ok, kind: "stamp" }));
    await refused(addField(id, { ...ok, signerId: b.id }));
    expect((await getRequest(id))!.fields).toHaveLength(0);
  });

  it("never lets a request have more fields than the limit", async () => {
    const id = await draft();
    await addSigner(id, "A", "a@exemple.test");
    const a = (await getRequest(id))!.signers[0];
    await Promise.all(Array.from({ length: MAX_FIELDS }, () => addField(id, { signerId: a.id, kind: "text", page: 1, box: { x: 1, y: 1, w: 10, h: 3 }, required: false })));
    await refused(addField(id, { signerId: a.id, kind: "text", page: 1, box: { x: 1, y: 1, w: 10, h: 3 }, required: false }));
    expect((await getRequest(id))!.fields).toHaveLength(MAX_FIELDS);
  });

  it("removes a field only from its own request", async () => {
    const id = await draft(), other = await draft();
    await addSigner(id, "A", "a@exemple.test");
    const a = (await getRequest(id))!.signers[0];
    await addField(id, { signerId: a.id, kind: "signature", page: 1, box, required: true });
    const f = (await getRequest(id))!.fields[0];
    await removeField(other, f.id);
    expect((await getRequest(id))!.fields).toHaveLength(1);
    await removeField(id, f.id);
    expect((await getRequest(id))!.fields).toHaveLength(0);
  });
});

describe("settings and checking", () => {
  it("stores the expiry as the end of the chosen day in Madrid, the language, the order and the message", async () => {
    const id = await draft();
    await updateSettings(id, { locale: "es", message: "  Gracias  ", expiresOn: "2026-12-15", ordered: true });
    const r = (await getRequest(id))!.request;
    expect(r).toMatchObject({ locale: "es", message: "Gracias", ordered: true });
    expect(r.expiresAt!.toISOString()).toBe("2026-12-15T22:59:59.000Z");
    expect(await refused(updateSettings(id, { locale: "fr", message: "", expiresOn: "2026-12-15", ordered: false }))).toMatch(/Idioma/);
    expect(await refused(updateSettings(id, { locale: "ca", message: "", expiresOn: "2026-02-30", ordered: false }))).toMatch(/caducitat/);
    await renameDocument(id, "  Nou títol ");
    expect((await getRequest(id))!.document.title).toBe("Nou títol");
    await refused(renameDocument(id, "   "));
  });

  it("reports what still blocks sending, and nothing when the request is complete", async () => {
    const id = await draft();
    expect((await checkRequest(id)).map((p) => p.code)).toEqual(["no_signers"]);
    await addSigner(id, "A", "a@exemple.test");
    expect((await checkRequest(id)).map((p) => p.code)).toEqual(["signer_without_signature"]);
    const a = (await getRequest(id))!.signers[0];
    await addField(id, { signerId: a.id, kind: "signature", page: 1, box, required: true });
    expect(await checkRequest(id)).toEqual([]);
    await db.update(signRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(signRequests.id, id));
    expect((await checkRequest(id)).map((p) => p.code)).toEqual(["expiry_past"]);
  });
});

describe("only a draft can be changed", () => {
  it("refuses every change once the request is no longer a draft, and still lets it be read", async () => {
    const id = await draft();
    await addSigner(id, "A", "a@exemple.test");
    const a = (await getRequest(id))!.signers[0];
    await addField(id, { signerId: a.id, kind: "signature", page: 1, box, required: true });
    const f = (await getRequest(id))!.fields[0];
    await db.update(signRequests).set({ status: "sent" }).where(eq(signRequests.id, id));
    const msg = /esborrany/;
    expect(await refused(addSigner(id, "B", "b@exemple.test"))).toMatch(msg);
    expect(await refused(removeSigner(id, a.id))).toMatch(msg);
    expect(await refused(moveSigner(id, a.id, 1))).toMatch(msg);
    expect(await refused(addField(id, { signerId: a.id, kind: "text", page: 1, box, required: false }))).toMatch(msg);
    expect(await refused(removeField(id, f.id))).toMatch(msg);
    expect(await refused(updateSettings(id, { locale: "ca", message: "", expiresOn: "2026-12-15", ordered: false }))).toMatch(msg);
    expect(await refused(renameDocument(id, "Altre"))).toMatch(msg);
    expect(await refused(deleteDraft(id))).toMatch(msg);
    const r = (await getRequest(id))!;
    expect(r.signers).toHaveLength(1);
    expect(r.fields).toHaveLength(1);
  });
});

describe("deleting a draft", () => {
  it("removes the document, the signers, the fields, the events and the stored file", async () => {
    const id = await draft();
    await addSigner(id, "A", "a@exemple.test");
    const a = (await getRequest(id))!.signers[0];
    await addField(id, { signerId: a.id, kind: "signature", page: 1, box, required: true });
    const key = (await getRequest(id))!.document.fileKey, docId = (await getRequest(id))!.document.id;
    await deleteDraft(id);
    expect(await getRequest(id)).toBeNull();
    expect(await db.select().from(signDocuments).where(eq(signDocuments.id, docId))).toHaveLength(0);
    expect(await db.select().from(signSigners).where(eq(signSigners.requestId, id))).toHaveLength(0);
    expect(await db.select().from(signFields).where(eq(signFields.requestId, id))).toHaveLength(0);
    expect(await db.select().from(signEvents).where(eq(signEvents.requestId, id))).toHaveLength(0);
    await expect(getPrivateBytes(key)).rejects.toThrow();
  });
});
