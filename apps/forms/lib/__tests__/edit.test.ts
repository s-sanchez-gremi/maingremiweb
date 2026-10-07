import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { contacts, forms, outbox, submissions } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import { EDIT_WINDOW_DAYS, MAX_EDITS, applyEdit, editDeadline, editLink, loadForEdit } from "@apex/forms/edit";
import { hashToken } from "@apex/forms/drafts";
import { processSubmission, type FormRow } from "@apex/forms/submit";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(type), required: "no", ...data } });
const name = item("text", { label: L("Nom"), required: "yes", map: "name" });
const email = item("email", { label: L("Correu"), required: "yes", map: "email" });
const phone = item("phone", { label: L("Telèfon"), map: "phone" });
const company = item("text", { label: L("Empresa"), map: "company" });
const notes = item("textarea", { label: L("Notes") });
const guests = item("number", { label: L("Persones"), min: "1", max: "20" });
const rating = item("rating", { label: L("Valoració"), max: "5" });
const yn = item("yesno", { label: L("Vens en cotxe?") });
const why = item("text", { label: L("Quin cotxe?"), required: "yes", showField: yn.id, showOp: "equals", showValue: "yes" });
const cv = item("file", { label: L("CV") });
const FIELDS = [name, email, phone, company, notes, guests, rating, yn, why, cv];
const STAFF = "equip-edits@apex.test";
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("contingut")]);

const make = async (over: Partial<typeof forms.$inferInsert> = {}) => {
  const [f] = await db.insert(forms).values({
    name: "Edicions", slug: "edit-" + crypto.randomUUID().slice(0, 8), destination: "crm_lead", active: true, allowEdits: true, fields: FIELDS as never,
    notifications: { staffEmail: true, staffAddresses: STAFF, confirmToSender: true }, ...over,
  }).returning();
  return f as FormRow;
};
const mail = () => `edit-${crypto.randomUUID().slice(0, 8)}@e2e.test`;
const send = async (form: FormRow, answers: Record<string, unknown> = {}, extra: { files?: boolean } = {}) => {
  const address = mail();
  const r = await processSubmission({
    form, locale: "ca", consent: false, newsletter: false,
    files: extra.files ? { [cv.id]: { name: "cv.pdf", bytes: PDF } } : {},
    answers: { [name.id]: "Núria Soler", [email.id]: address, [phone.id]: "600111222", [company.id]: "Gràfiques Vila", [notes.id]: "Primera versió", [guests.id]: "2", [rating.id]: "4", [yn.id]: "yes", [why.id]: "Seat", ...answers },
    meta: { sourcePath: "/ca/jornada", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
  });
  if (!r.ok) throw new Error("submission refused: " + JSON.stringify(r));
  return { ...r, address };
};
const row = async (id: string) => (await db.select().from(submissions).where(eq(submissions.id, id)))[0];
const value = (answers: { id: string; value: unknown }[], id: string) => answers.find((a) => a.id === id)?.value;

describe("the private link", () => {
  it("exists only when the form allows edits, and only its hash is stored", async () => {
    const off = await make({ allowEdits: false });
    const none = await send(off);
    expect(none.editToken).toBeUndefined();
    expect((await row(none.id)).editTokenHash).toBeNull();

    const on = await make();
    const s = await send(on);
    expect(s.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const r = await row(s.id);
    expect(r.editTokenHash).toBe(hashToken(s.editToken!));
    expect(JSON.stringify(r)).not.toContain(s.editToken!);
  });

  it("is mailed with the confirmation, to the page the form was on, with the deadline", async () => {
    const f = await make();
    const s = await send(f);
    const m = (await db.select().from(outbox)).find((x) => (x.payload as { to: string }).to === s.address)!;
    const text = (m.payload as { text: string }).text;
    expect(text).toContain(`http://localhost:3000/ca/jornada?edit=${s.editToken}`);
    expect(text).toMatch(/fins al \d{1,2} de \w+ del? \d{4} des d/);
  });

  it("is not added to the confirmation of a form that does not allow edits", async () => {
    const f = await make({ allowEdits: false });
    const s = await send(f);
    const m = (await db.select().from(outbox)).find((x) => (x.payload as { to: string }).to === s.address)!;
    expect((m.payload as { text: string }).text).not.toContain("?edit=");
  });

  it("builds the link from a path of this site only", () => {
    const base = { locale: "ca" as const, slug: "curs", token: "T" };
    expect(editLink({ ...base, sourcePath: "/ca/formacio?x=1#a" })).toBe("http://localhost:3000/ca/formacio?edit=T");
    expect(editLink({ ...base, sourcePath: "//evil.example" })).toBe("http://localhost:3000/ca/form/curs?edit=T");
  });
});

describe("opening a response to edit it", () => {
  it("gives the answers in the shape the form's inputs hold them, lists files by name only and locks the contact's email", async () => {
    const f = await make();
    const s = await send(f, {}, { files: true });
    const v = (await loadForEdit(f, s.editToken))!;
    expect(v.answers).toMatchObject({ [name.id]: "Núria Soler", [guests.id]: "2", [rating.id]: "4", [yn.id]: "yes", [why.id]: "Seat" });
    expect(v.files).toEqual([{ id: cv.id, label: "CV", name: "cv.pdf" }]);
    expect(JSON.stringify(v)).not.toContain("submissions/"); // never the storage key
    expect(v.answers[cv.id]).toBeUndefined();
    expect(v.locked).toEqual([email.id]);
    expect(new Date(v.until).getTime()).toBe(editDeadline((await row(s.id)).createdAt).getTime());
  });

  it("refuses anything that is not that response's own secret, for that form, in time", async () => {
    const f = await make(), other = await make();
    const s = await send(f);
    for (const bad of [undefined, null, "", "short", s.editToken + "x", 5, { t: s.editToken }]) expect(await loadForEdit(f, bad), String(bad)).toBeNull();
    expect(await loadForEdit(other, s.editToken)).toBeNull(); // another form
    expect(await loadForEdit({ ...f, allowEdits: false }, s.editToken)).toBeNull(); // switched off by staff
    await db.update(submissions).set({ createdAt: new Date(Date.now() - (EDIT_WINDOW_DAYS - 1) * 86_400_000) }).where(eq(submissions.id, s.id));
    expect(await loadForEdit(f, s.editToken)).not.toBeNull();
    await db.update(submissions).set({ createdAt: new Date(Date.now() - (EDIT_WINDOW_DAYS + 1) * 86_400_000) }).where(eq(submissions.id, s.id));
    expect(await loadForEdit(f, s.editToken)).toBeNull(); // the 30 days are over
  });

  it("follows the form's state: closed or past its end date stops it, merely being full does not", async () => {
    const f = await make();
    const s = await send(f);
    expect(await loadForEdit({ ...f, active: false }, s.editToken)).toBeNull();
    expect(await loadForEdit({ ...f, closesAt: new Date(Date.now() - 1000) }, s.editToken)).toBeNull();
    expect(await loadForEdit({ ...f, closesAt: new Date(Date.now() + 60_000) }, s.editToken)).not.toBeNull();
    const limited = await make({ maxResponses: 1 });
    const only = await send(limited);
    expect(await loadForEdit(limited, only.editToken)).not.toBeNull(); // full for new responses, still correctable
  });
});

describe("saving changes", () => {
  it("replaces the answers, keeps the first version once, counts the edit and follows the contact's name, phone and company", async () => {
    const f = await make();
    const s = await send(f);
    const changed = await applyEdit(f, s.editToken, { locale: "ca", answers: { [name.id]: "Núria Soler Puig", [phone.id]: "600999888", [company.id]: "", [notes.id]: "Segona versió", [guests.id]: "3", [rating.id]: "5", [yn.id]: "yes", [why.id]: "Seat" } });
    expect(changed).toEqual({ ok: true, changed: true });
    const r = await row(s.id);
    expect(value(r.answers, name.id)).toBe("Núria Soler Puig");
    expect(value(r.answers, notes.id)).toBe("Segona versió");
    expect(value(r.answers, guests.id)).toBe(3);
    expect(value(r.answers, rating.id)).toBe(5);
    expect(value(r.answers, company.id)).toBe("");
    expect(r).toMatchObject({ editCount: 1 });
    expect(r.editedAt).not.toBeNull();
    expect(value(r.originalAnswers!, notes.id)).toBe("Primera versió");

    const [c] = await db.select().from(contacts).where(eq(contacts.id, r.contactId!));
    expect(c).toMatchObject({ name: "Núria Soler Puig", phone: "600999888", email: s.address });
    expect(c.company).toBe("Gràfiques Vila"); // a blank never erases what is known

    // a second edit keeps the FIRST original, not the intermediate one
    await db.update(submissions).set({ editedAt: new Date(Date.now() - 5000) }).where(eq(submissions.id, s.id));
    await applyEdit(f, s.editToken, { locale: "ca", answers: { ...Object.fromEntries(r.answers.map((a) => [a.id, a.value])), [notes.id]: "Tercera versió" } });
    const r2 = await row(s.id);
    expect(r2.editCount).toBe(2);
    expect(value(r2.originalAnswers!, notes.id)).toBe("Primera versió");
  });

  it("the email that identifies the contact cannot be changed, whatever the browser sends", async () => {
    const f = await make();
    const s = await send(f);
    const r0 = await row(s.id);
    await applyEdit(f, s.editToken, { locale: "ca", answers: { [name.id]: "Nom nou", [email.id]: "someone-else@e2e.test", [yn.id]: "yes", [why.id]: "Seat" } });
    const r = await row(s.id);
    expect(value(r.answers, email.id)).toBe(s.address);
    expect(r.contactId).toBe(r0.contactId);
    expect((await db.select().from(contacts).where(eq(contacts.email, "someone-else@e2e.test"))).length).toBe(0);
    expect((await db.select().from(contacts).where(eq(contacts.id, r.contactId!)))[0].email).toBe(s.address);
  });

  it("validates against the form as it is now, writes nothing when refused, and keeps required fields required", async () => {
    const f = await make();
    const s = await send(f);
    const refused = await applyEdit(f, s.editToken, { locale: "ca", answers: { [name.id]: "", [guests.id]: "99", [yn.id]: "yes", [why.id]: "Seat" } });
    expect(refused).toMatchObject({ ok: false, code: "invalid", errors: { [name.id]: "Aquest camp és obligatori", [guests.id]: "El valor ha de ser com a màxim 20" } });
    expect(await row(s.id)).toMatchObject({ editCount: 0, editedAt: null, originalAnswers: null });
    // a required field added to the form after the response was sent must be filled in to save changes
    const added = item("text", { label: L("Nova pregunta obligatòria"), required: "yes" });
    const grown = { ...f, fields: [...FIELDS, added] as never };
    const need = await applyEdit(grown, s.editToken, { locale: "ca", answers: { [name.id]: "Nom", [yn.id]: "yes", [why.id]: "Seat" } });
    expect(need).toMatchObject({ ok: false, code: "invalid", errors: { [added.id]: "Aquest camp és obligatori" } });
  });

  it("a hidden answer is dropped, a removed field's answer is kept as it was, and files are never lost", async () => {
    const f = await make();
    const s = await send(f, {}, { files: true });
    const fileBefore = value((await row(s.id)).answers, cv.id);
    expect(fileBefore).toMatchObject({ name: "cv.pdf" });
    // saying "No" hides «Quin cotxe?»: that answer goes
    await applyEdit(f, s.editToken, { locale: "ca", answers: { [name.id]: "Núria", [notes.id]: "Primera versió", [yn.id]: "no" } });
    const a = await row(s.id);
    expect(a.answers.some((x) => x.id === why.id)).toBe(false);
    expect(value(a.answers, cv.id)).toEqual(fileBefore); // the stored file and its key are untouched
    // a field removed from the form later keeps its old answer
    const shrunk = { ...f, fields: FIELDS.filter((i) => i.id !== notes.id) as never };
    await db.update(submissions).set({ editedAt: new Date(Date.now() - 5000) }).where(eq(submissions.id, s.id));
    await applyEdit(shrunk, s.editToken, { locale: "ca", answers: { [name.id]: "Núria Soler", [notes.id]: "ignored: the field is gone", [yn.id]: "no" } });
    expect(value((await row(s.id)).answers, notes.id)).toBe("Primera versió");
  });

  it("changing nothing writes nothing and notifies nobody", async () => {
    const f = await make();
    const s = await send(f);
    const before = (await db.select().from(outbox)).length;
    const same = Object.fromEntries((await row(s.id)).answers.map((a) => [a.id, a.type === "yesno" ? (a.value ? "yes" : "no") : a.type === "number" || a.type === "rating" ? String(a.value) : a.value]));
    expect(await applyEdit(f, s.editToken, { locale: "ca", answers: same })).toEqual({ ok: true, changed: false });
    expect(await row(s.id)).toMatchObject({ editCount: 0, editedAt: null });
    expect((await db.select().from(outbox)).length).toBe(before);
  });

  it("tells the staff exactly what changed, and nothing when staff mail is off", async () => {
    const f = await make();
    const s = await send(f);
    await applyEdit(f, s.editToken, { locale: "ca", answers: { [name.id]: "Núria Soler", [notes.id]: "Versió corregida", [yn.id]: "yes", [why.id]: "Seat" } });
    const m = (await db.select().from(outbox).orderBy(asc(outbox.id))).filter((x) => (x.payload as { to: string }).to === STAFF && (x.payload as { subject: string }).subject.startsWith("Resposta modificada"));
    const body = (m[m.length - 1].payload as { text: string }).text;
    expect(body).toContain("Notes: Primera versió → Versió corregida");
    expect(body).not.toContain("Nom:"); // unchanged fields are not listed
    expect(body).toContain("/admin/forms/");
    const quiet = await make({ notifications: { staffEmail: false } });
    const q = await send(quiet);
    const count0 = (await db.select().from(outbox)).length;
    await applyEdit(quiet, q.editToken, { locale: "ca", answers: { [name.id]: "Altre nom", [yn.id]: "yes", [why.id]: "Seat" } });
    expect((await db.select().from(outbox)).length).toBe(count0);
  });

  it("limits how fast and how often a response can be changed", async () => {
    const f = await make();
    const s = await send(f);
    const a = { [name.id]: "Nom", [yn.id]: "yes", [why.id]: "Seat" };
    expect(await applyEdit(f, s.editToken, { locale: "ca", answers: { ...a, [notes.id]: "u" } })).toMatchObject({ ok: true });
    expect(await applyEdit(f, s.editToken, { locale: "ca", answers: { ...a, [notes.id]: "dos" } })).toEqual({ ok: false, code: "too_soon" });
    await db.update(submissions).set({ editCount: MAX_EDITS, editedAt: new Date(Date.now() - 60_000) }).where(eq(submissions.id, s.id));
    expect(await applyEdit(f, s.editToken, { locale: "ca", answers: { ...a, [notes.id]: "massa" } })).toEqual({ ok: false, code: "too_many" });
  });

  it("only the response's own secret opens it", async () => {
    const f = await make();
    const mine = await send(f), theirs = await send(f);
    expect(await applyEdit(f, "A".repeat(43), { locale: "ca", answers: {} })).toEqual({ ok: false, code: "not_found" });
    expect(await applyEdit({ ...f, allowEdits: false }, mine.editToken, { locale: "ca", answers: {} })).toEqual({ ok: false, code: "not_found" });
    await applyEdit(f, mine.editToken, { locale: "ca", answers: { [name.id]: "Només la meva", [yn.id]: "no" } });
    expect(value((await row(theirs.id)).answers, name.id)).toBe("Núria Soler");
    expect(value((await row(mine.id)).answers, name.id)).toBe("Només la meva");
  });

  it("does not touch the consent that was given when the response was sent", async () => {
    const f = await make({ consent: L("Accepto la política") });
    const address = mail();
    const r = await processSubmission({
      form: f, locale: "ca", consent: true, newsletter: false, files: {},
      answers: { [name.id]: "Ona", [email.id]: address, [yn.id]: "no" }, meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() },
    });
    if (!r.ok) throw new Error("refused");
    const before = await row(r.id);
    await applyEdit(f, r.editToken, { locale: "ca", answers: { [name.id]: "Ona Puig", [yn.id]: "no" } });
    const after = await row(r.id);
    expect(after.consentText).toBe("Accepto la política");
    expect(after.consentAt?.getTime()).toBe(before.consentAt?.getTime());
  });
});
