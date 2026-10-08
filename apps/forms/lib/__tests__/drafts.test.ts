import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { formDrafts, forms, outbox } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import {
  DraftTooLarge, LIMIT_CREATE_PER_HOUR, LIMIT_MAILS_PER_DAY, cleanDraftAnswers, cleanEmail, cleanStep, countDrafts, createDraft, createRateLimited, deleteDraft, emailKey, hashToken,
  loadDraft, mailRateLimited, newToken, purgeDrafts, resumeLink, updateDraft,
} from "@apex/forms/drafts";
import { processSubmission, type FormRow } from "@apex/forms/submit";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, data: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(type), required: "no", ...data } });
const name = item("text"), em = item("email", { required: "yes" }), pick = item("choice", { multiple: "many", options: [{ label: L("A") }, { label: L("B") }] });
const addr = item("address"), file = item("file"), title = item("heading", { title: L("T") }), yn = item("yesno");
const items = [name, em, pick, addr, file, title, yn];

const make = async (over: Partial<typeof forms.$inferInsert> = {}) => {
  const [f] = await db.insert(forms).values({ name: "Esborranys", slug: "esb-" + crypto.randomUUID().slice(0, 8), destination: "responses_only", active: true, allowDrafts: true, fields: items as never, ...over }).returning();
  return f as FormRow;
};
const draftFor = (f: FormRow, over: Partial<Parameters<typeof createDraft>[0]> = {}) =>
  createDraft({ form: f, items: f.fields as Item[], answers: { [name.id]: "Núria" }, step: 0, locale: "ca", sourcePath: "/ca/formacio", ipHash: "ip-" + crypto.randomUUID(), challengeId: crypto.randomUUID(), email: null, ...over });

describe("the secret", () => {
  it("is long and random, and only its hash is stored", async () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    const f = await make();
    const { token } = await draftFor(f);
    const [row] = await db.select().from(formDrafts).where(eq(formDrafts.formId, f.id));
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
  it("opens only its own draft, only for the form it was made for, and malformed secrets never reach the database", async () => {
    const f = await make(), other = await make();
    const { token } = await draftFor(f);
    expect(await loadDraft(f.id, token)).not.toBeNull();
    expect(await loadDraft(other.id, token)).toBeNull();
    for (const bad of [undefined, null, "", "short", token + "x", token.slice(1), 42, { token }]) expect(await loadDraft(f.id, bad)).toBeNull();
  });
});

describe("what a draft keeps", () => {
  it("only answers of this form's own fields that take an answer, and never files", () => {
    const out = cleanDraftAnswers(items, {
      [name.id]: "Núria", [file.id]: { name: "cv.pdf" }, [title.id]: "x", [crypto.randomUUID()]: "foreign", [yn.id]: "no", [em.id]: true,
      [pick.id]: ["A", "B", { evil: 1 }, 7], [addr.id]: { street: "Carrer Major 1", postalCode: "08001", city: "Girona", extra: "dropped" },
    });
    expect(Object.keys(out).sort()).toEqual([name.id, em.id, pick.id, addr.id, yn.id].sort());
    expect(out[pick.id]).toEqual(["A", "B"]);
    expect(out[addr.id]).toEqual({ street: "Carrer Major 1", postalCode: "08001", city: "Girona" });
  });
  it("limits text, lists and shapes, and ignores anything that is not an object", () => {
    const out = cleanDraftAnswers(items, { [name.id]: "x".repeat(9000), [pick.id]: Array.from({ length: 80 }, () => "y".repeat(900)), [yn.id]: { nested: { deep: 1 } } });
    expect((out[name.id] as string).length).toBe(5000);
    expect((out[pick.id] as string[]).length).toBe(50);
    expect((out[pick.id] as string[])[0].length).toBe(500);
    expect(out[yn.id]).toBeUndefined();
    for (const junk of [null, undefined, "text", 5, [], [1, 2]]) expect(cleanDraftAnswers(items, junk)).toEqual({});
  });
  it("clamps the step and refuses an oversized draft", async () => {
    expect([cleanStep(3), cleanStep(-1), cleanStep(1.5), cleanStep("2"), cleanStep(999), cleanStep(undefined)]).toEqual([3, 0, 0, 0, 0, 0]);
    const many = Array.from({ length: 20 }, () => item("textarea"));
    const f = await make({ fields: many as never });
    const big = Object.fromEntries(many.map((i) => [i.id, "z".repeat(5000)]));
    await expect(draftFor(f, { items: many, answers: big })).rejects.toBeInstanceOf(DraftTooLarge);
    expect(await countDrafts(f.id)).toBe(0);
  });
});

describe("saving, resuming and expiring", () => {
  it("stores the answers and the step, and gives them back cleaned against the form as it is now", async () => {
    const f = await make();
    const { token } = await draftFor(f, { answers: { [name.id]: "Núria", [em.id]: "n@e2e.test", [file.id]: "ignored" }, step: 2 });
    const d = await loadDraft(f.id, token);
    expect(d).toMatchObject({ step: 2, locale: "ca", sourcePath: "/ca/formacio" });
    expect(d!.answers).toEqual({ [name.id]: "Núria", [em.id]: "n@e2e.test" });
    expect(d!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  });
  it("an update replaces the answers, extends the expiry and is limited to one save per second", async () => {
    const f = await make();
    const { token } = await draftFor(f);
    const [before] = await db.select().from(formDrafts).where(eq(formDrafts.formId, f.id));
    expect(await updateDraft(f.id, token, items, { answers: { [name.id]: "x" }, step: 1 }, new Date(before.updatedAt.getTime() + 500))).toBe("too_soon");
    const later = new Date(before.updatedAt.getTime() + 60_000);
    expect(await updateDraft(f.id, token, items, { answers: { [name.id]: "Núria Soler", [em.id]: "n@e2e.test" }, step: 1 }, later)).toBe("ok");
    const [after] = await db.select().from(formDrafts).where(eq(formDrafts.formId, f.id));
    expect(after.answers).toEqual({ [name.id]: "Núria Soler", [em.id]: "n@e2e.test" });
    expect(after.step).toBe(1);
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());
    expect(await updateDraft(f.id, "A".repeat(43), items, { answers: {}, step: 0 })).toBe("missing");
  });
  it("an expired draft cannot be opened or updated, and unknown and expired look the same", async () => {
    const f = await make();
    const { token } = await draftFor(f);
    await db.update(formDrafts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(formDrafts.formId, f.id));
    expect(await loadDraft(f.id, token)).toBeNull();
    expect(await updateDraft(f.id, token, items, { answers: {}, step: 0 }, new Date(Date.now() + 5000))).toBe("missing");
    expect(await countDrafts(f.id)).toBe(0); // expired ones are not counted either
  });
  it("can be deleted by its owner, and goes with the form", async () => {
    const f = await make();
    const { token } = await draftFor(f);
    await deleteDraft(f.id, "wrong-secret");
    expect(await loadDraft(f.id, token)).not.toBeNull();
    await deleteDraft(f.id, token);
    expect(await loadDraft(f.id, token)).toBeNull();
    const g = await make();
    await draftFor(g); await draftFor(g);
    expect(await countDrafts(g.id)).toBe(2);
    await db.delete(forms).where(eq(forms.id, g.id));
    expect(await db.select().from(formDrafts).where(eq(formDrafts.formId, g.id))).toHaveLength(0);
  });
  it("a bot-check solution creates only one draft", async () => {
    const f = await make();
    const challengeId = crypto.randomUUID();
    await draftFor(f, { challengeId });
    await expect(draftFor(f, { challengeId })).rejects.toMatchObject({ cause: { code: "23505" } });
  });
});

describe("the emailed link", () => {
  it("is queued with the link to the page the form was on, in the visitor's language, and the address is not kept", async () => {
    const f = await make({ title: { ca: "Inscripció al curs", es: "Inscripción al curso", en: "Course enrolment" } });
    const address = `maria-${crypto.randomUUID().slice(0, 6)}@e2e.test`;
    const { token } = await draftFor(f, { email: address, locale: "es" });
    const mail = (await db.select().from(outbox)).find((m) => (m.payload as { to: string }).to === address)!;
    const p = mail.payload as { subject: string; text: string };
    expect(p.subject).toBe("Continúa el formulario «Inscripción al curso»");
    expect(p.text).toContain(`http://localhost:3000/ca/formacio?resume=${token}`);
    expect(p.text).toMatch(/hasta el \d+ de \w+ de \d{4}/);
    const [row] = await db.select().from(formDrafts).where(eq(formDrafts.formId, f.id));
    expect(JSON.stringify(row)).not.toContain(address);
    expect(row.emailHash).toBe(emailKey(address));
    expect(emailKey(address.toUpperCase())).toBe(emailKey(address));
  });
  it("is not queued without an address", async () => {
    const f = await make();
    const before = (await db.select().from(outbox)).length;
    await draftFor(f);
    expect((await db.select().from(outbox)).length).toBe(before);
  });
  it("builds the link from a path of this site only", () => {
    const base = { locale: "ca" as const, slug: "curs", token: "T" };
    expect(resumeLink({ ...base, sourcePath: "/ca/formacio/curs?utm=x#a" })).toBe("http://localhost:3000/ca/formacio/curs?resume=T");
    expect(resumeLink({ ...base, sourcePath: "" })).toBe("http://localhost:3000/ca/form/curs?resume=T");
    expect(resumeLink({ ...base, sourcePath: "//evil.example/x" })).toBe("http://localhost:3000/ca/form/curs?resume=T");
    expect(resumeLink({ ...base, sourcePath: "https://evil.example" })).toBe("http://localhost:3000/ca/form/curs?resume=T");
  });
  it("accepts only a plausible address", () => {
    expect(cleanEmail(" Maria@E2E.test ")).toBe("maria@e2e.test");
    for (const bad of ["", "   ", "nope", "a@b", "a b@c.cat", 5, null, `${"x".repeat(250)}@e2e.test`]) expect(cleanEmail(bad), String(bad)).toBeNull();
  });
});

describe("limits", () => {
  it("creating drafts is limited per address and form", async () => {
    const f = await make(), ip = "ip-limit-" + crypto.randomUUID();
    for (let i = 0; i < LIMIT_CREATE_PER_HOUR; i++) { expect(await createRateLimited(ip, f.id)).toBe(false); await draftFor(f, { ipHash: ip }); }
    expect(await createRateLimited(ip, f.id)).toBe(true);
    expect(await createRateLimited(ip, (await make()).id)).toBe(false); // another form is counted separately
    expect(await createRateLimited("someone-else", f.id)).toBe(false);
    expect(await createRateLimited(ip, f.id, new Date(Date.now() + 2 * 3_600_000))).toBe(false); // the window moves on
  });
  it("mailing the link is limited per address, case-insensitively", async () => {
    const f = await make(), address = `limit-${crypto.randomUUID().slice(0, 6)}@e2e.test`;
    for (let i = 0; i < LIMIT_MAILS_PER_DAY; i++) { expect(await mailRateLimited(emailKey(address))).toBe(false); await draftFor(f, { email: i % 2 ? address.toUpperCase() : address }); }
    expect(await mailRateLimited(emailKey(address))).toBe(true);
    expect(await mailRateLimited(emailKey("other@e2e.test"))).toBe(false);
  });
});

describe("cleaning up", () => {
  it("deletes expired drafts and forgets the hashed addresses after a day, keeping the draft itself", async () => {
    const f = await make();
    const keep = await draftFor(f, { email: "keep@e2e.test", ipHash: "ip-keep" });
    const old = await draftFor(f, { email: "old@e2e.test", ipHash: "ip-old" });
    const gone = await draftFor(f);
    await db.update(formDrafts).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(formDrafts.tokenHash, hashToken(old.token)));
    await db.update(formDrafts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(formDrafts.tokenHash, hashToken(gone.token)));
    const { deleted } = await purgeDrafts();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await loadDraft(f.id, gone.token)).toBeNull();
    const [o] = await db.select().from(formDrafts).where(eq(formDrafts.tokenHash, hashToken(old.token)));
    expect(o).toMatchObject({ ipHash: null, emailHash: null }); // the draft stays; only the addresses are forgotten
    const [k] = await db.select().from(formDrafts).where(eq(formDrafts.tokenHash, hashToken(keep.token)));
    expect(k.ipHash).toBe("ip-keep");
    expect(k.emailHash).not.toBeNull();
  });
});

describe("sending the form", () => {
  let f: FormRow;
  beforeEach(async () => { f = await make({ fields: [em] as never }); });
  const send = (form: FormRow, draftToken?: string | null) => processSubmission({
    form, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [em.id]: "ana@e2e.test" },
    meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID(), draftToken },
  });

  it("deletes the draft it came from, and only that one", async () => {
    const mine = await draftFor(f), another = await draftFor(f), otherForm = await make({ fields: [em] as never }), foreign = await draftFor(otherForm);
    expect(await send(f, mine.token)).toMatchObject({ ok: true });
    expect(await loadDraft(f.id, mine.token)).toBeNull();
    expect(await loadDraft(f.id, another.token)).not.toBeNull();
    expect(await send(f, foreign.token)).toMatchObject({ ok: true }); // another form's secret does nothing here
    expect(await loadDraft(otherForm.id, foreign.token)).not.toBeNull();
  });
  it("ignores a missing or invalid draft secret, and keeps the draft when the answers are refused", async () => {
    for (const t of [undefined, null, "", "garbage"]) expect(await send(f, t)).toMatchObject({ ok: true });
    const keep = await draftFor(f);
    const refused = await processSubmission({
      form: f, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [em.id]: "not an email" },
      meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID(), draftToken: keep.token },
    });
    expect(refused).toMatchObject({ ok: false, code: "invalid" });
    expect(await loadDraft(f.id, keep.token)).not.toBeNull(); // the visitor can still fix the answers and send
  });
});
