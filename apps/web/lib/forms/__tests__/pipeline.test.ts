import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { contacts, forms, leads, newsletterOptins, outbox, submissions, type FormItem } from "@/db/schema";
import { processSubmission, parseAddresses, type FormRow, type SubmitInput } from "../submit";
import { processOutbox } from "../../outbox";
import { deleteSubmission, eraseContact, formStats, purgeIpHashes, recordStart } from "../admin-data";
import { isRateLimited } from "../limits";
import { getPrivateBytes } from "../../storage";

const L = (ca: string, es = "", en = "") => ({ ca, es, en });
let n = 0;
const field = (type: string, data: Record<string, unknown> = {}): FormItem => ({ id: crypto.randomUUID(), type, data: { label: L("Camp " + ++n), required: "no", ...data } });

const email = field("email", { required: "yes", map: "email", label: L("Correu") });
const name = field("text", { required: "yes", map: "name", label: L("Nom") });
const phone = field("phone", { map: "phone", label: L("Telèfon") });

async function makeForm(over: Partial<FormRow> = {}, items: FormItem[] = [name, email, phone]): Promise<FormRow> {
  const [f] = await db.insert(forms).values({
    name: "Contacte", slug: "f-" + crypto.randomUUID().slice(0, 8), fields: items, destination: "crm_lead", active: true,
    notifications: { staffEmail: true, staffAddresses: "equip@apex.test, altre@apex.test", confirmToSender: true, confirmSubject: L("Rebut", "Recibido", "Received"), confirmBody: L("Gràcies!", "¡Gracias!", "Thanks!") },
    consent: L("Accepto la política de privacitat", "Acepto la política", "I accept the policy"), ...over,
  }).returning();
  return f;
}
const base = (form: FormRow, answers: Record<string, unknown>, over: Partial<SubmitInput> = {}): SubmitInput => ({
  form, locale: "ca", answers, files: {}, consent: true, newsletter: false,
  meta: { sourcePath: "/ca/cursos", theme: "formacio", utm: { utm_source: "news", utm_campaign: "tardor" }, ipHash: "h1", challengeId: crypto.randomUUID() },
  ...over,
});
const sent: { to: string; subject: string; text: string }[] = [];
const transport = { sendMail: async (m: { from: string; to: string; subject: string; text: string }) => { sent.push(m); } };

beforeEach(async () => { await db.delete(forms); await db.delete(contacts); await db.delete(newsletterOptins); await db.delete(outbox); sent.length = 0; });

describe("happy path", () => {
  it("stores the submission, creates contact + lead with source tags and the exact consent, queues both emails", async () => {
    const f = await makeForm();
    const r = await processSubmission(base(f, { [name.id]: "Ana Puig", [email.id]: "ANA@Apex.test", [phone.id]: "+34 600 111 222" }));
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(contacts);
    expect(c).toMatchObject({ email: "ana@apex.test", name: "Ana Puig", phone: "+34 600 111 222", locale: "ca" });
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ contactId: c.id, formId: f.id, sourcePath: "/ca/cursos", theme: "formacio", locale: "ca", status: "new" });
    expect(lead.utm).toEqual({ utm_source: "news", utm_campaign: "tardor" });
    const [sub] = await db.select().from(submissions);
    expect(sub.consentText).toBe("Accepto la política de privacitat");
    expect(sub.consentAt).not.toBeNull();
    expect(sub.answers.map((a) => [a.label, a.value])).toEqual([["Nom", "Ana Puig"], ["Correu", "ana@apex.test"], ["Telèfon", "+34 600 111 222"]]);

    expect(await processOutbox({ transport })).toEqual({ sent: 3, failed: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual(["altre@apex.test", "ana@apex.test", "equip@apex.test"]);
    const staff = sent.find((m) => m.to === "equip@apex.test")!;
    expect(staff.text).toContain("Correu: ana@apex.test");
    expect(staff.text).toContain("utm_source=news");
    expect(staff.text).toContain("Accepto la política de privacitat");
    expect(sent.find((m) => m.to === "ana@apex.test")).toMatchObject({ subject: "Rebut", text: "Gràcies!" });
  });
  it("the same email is one contact with several leads; a blank value never erases what we know", async () => {
    const f = await makeForm();
    await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test", [phone.id]: "600111222" }));
    await processSubmission(base(f, { [name.id]: "Ana Puig", [email.id]: "ana@apex.test", [phone.id]: "" }));
    const cs = await db.select().from(contacts);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ name: "Ana Puig", phone: "600111222" });
    expect(await db.select().from(leads)).toHaveLength(2);
  });
  it("confirmation uses the visitor's language", async () => {
    const f = await makeForm();
    await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }, { locale: "en" }));
    await processOutbox({ transport });
    expect(sent.find((m) => m.to === "ana@apex.test")).toMatchObject({ subject: "Received", text: "Thanks!" });
  });
  it("responses-only forms create no contact and no lead", async () => {
    const f = await makeForm({ destination: "responses_only" });
    expect((await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }))).ok).toBe(true);
    expect(await db.select().from(contacts)).toHaveLength(0);
    expect(await db.select().from(leads)).toHaveLength(0);
    expect(await db.select().from(submissions)).toHaveLength(1);
  });
});

describe("rejections leave nothing behind", () => {
  it("invalid answers, missing consent and closed forms store nothing and queue nothing", async () => {
    const f = await makeForm();
    const bad = await processSubmission(base(f, { [name.id]: "", [email.id]: "no-correu" }));
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual([email.id, name.id].sort());
    const noConsent = await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }, { consent: false }));
    expect(noConsent.ok === false && noConsent.errors._consent).toBeTruthy();
    const closed = await processSubmission(base({ ...f, active: false }, { [name.id]: "Ana", [email.id]: "ana@apex.test" }));
    expect(closed).toMatchObject({ ok: false, code: "closed" });
    expect(await db.select().from(submissions)).toHaveLength(0);
    expect(await db.select().from(outbox)).toHaveLength(0);
    expect(await db.select().from(contacts)).toHaveLength(0);
  });
  it("a reused bot-check token is refused and the first submission stays the only one", async () => {
    const f = await makeForm();
    const token = crypto.randomUUID();
    const a = { [name.id]: "Ana", [email.id]: "ana@apex.test" };
    expect((await processSubmission(base(f, a, { meta: { ...base(f, a).meta, challengeId: token } }))).ok).toBe(true);
    const again = await processSubmission(base(f, a, { meta: { ...base(f, a).meta, challengeId: token } }));
    expect(again).toMatchObject({ ok: false, code: "replay" });
    expect(await db.select().from(submissions)).toHaveLength(1);
    expect(await db.select().from(leads)).toHaveLength(1);
  });
  it("hidden required fields are not enforced and hidden answers are dropped", async () => {
    const toggle = field("checkbox", { label: L("Vinc d'empresa") });
    const company = field("text", { required: "yes", showField: toggle.id, showOp: "equals", showValue: "yes", label: L("Empresa") });
    const f = await makeForm({}, [name, email, toggle, company]);
    const r = await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test", [toggle.id]: false, [company.id]: "injectat" }));
    expect(r.ok).toBe(true);
    const [sub] = await db.select().from(submissions);
    expect(sub.answers.find((a) => a.id === company.id)).toBeUndefined();
  });
});

describe("file uploads", () => {
  const pdf = () => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 65)]);
  it("stores a valid file privately, identified by bytes; erasing the submission erases the file", async () => {
    const doc = field("file", { label: L("CV") });
    const f = await makeForm({}, [name, email, doc]);
    const r = await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }, { files: { [doc.id]: { name: "cv ana!.pdf", bytes: pdf() } } }));
    expect(r.ok).toBe(true);
    const [sub] = await db.select().from(submissions);
    const file = sub.answers.find((a) => a.type === "file")!.value as { key: string; name: string; mime: string };
    expect(file).toMatchObject({ name: "cv ana.pdf", mime: "application/pdf" });
    expect(file.key).toMatch(new RegExp(`^submissions/${sub.id}/`));
    expect((await getPrivateBytes(file.key)).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await fetch(`http://localhost:9090/apex-media/${file.key}`)).status).toBe(404); // not in the public bucket
    await deleteSubmission(sub.id);
    await expect(getPrivateBytes(file.key)).rejects.toThrow();
    expect(await db.select().from(leads)).toHaveLength(0);
  });
  it("rejects a disguised executable, and an oversized file", async () => {
    const doc = field("file", { label: L("CV") });
    const f = await makeForm({}, [name, email, doc]);
    const a = { [name.id]: "Ana", [email.id]: "ana@apex.test" };
    const exe = await processSubmission(base(f, a, { files: { [doc.id]: { name: "cv.pdf", bytes: Buffer.from("MZ\x90\x00 evil") } } }));
    expect(exe.ok === false && exe.errors[doc.id]).toMatch(/Format/);
    const big = await processSubmission(base(f, a, { files: { [doc.id]: { name: "cv.pdf", bytes: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(11 * 1024 * 1024)]) } } }));
    expect(big.ok === false && big.errors[doc.id]).toMatch(/10 MB/);
    expect(await db.select().from(submissions)).toHaveLength(0);
  });
  it("a required file must be present", async () => {
    const doc = field("file", { required: "yes", label: L("CV") });
    const f = await makeForm({}, [name, email, doc]);
    const r = await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }));
    expect(r.ok === false && r.errors[doc.id]).toMatch(/fitxer/);
  });
});

describe("newsletter opt-in is separate from consent", () => {
  it("only stored when the form offers it AND the visitor ticked it, with its own wording", async () => {
    const f = await makeForm({ newsletter: { enabled: true, text: L("Vull rebre el butlletí") } });
    const a = { [name.id]: "Ana", [email.id]: "ana@apex.test" };
    await processSubmission(base(f, a, { newsletter: false }));
    expect(await db.select().from(newsletterOptins)).toHaveLength(0); // consent to the privacy policy != newsletter
    await processSubmission(base(f, a, { newsletter: true }));
    const [o] = await db.select().from(newsletterOptins);
    expect(o).toMatchObject({ email: "ana@apex.test", consentText: "Vull rebre el butlletí", syncedAt: null });
    const off = await makeForm({ newsletter: { enabled: false, text: L("x") } });
    await processSubmission(base(off, { [name.id]: "Bea", [email.id]: "bea@apex.test" }, { newsletter: true }));
    expect(await db.select().from(newsletterOptins)).toHaveLength(1);
  });
});

describe("outbox reliability", () => {
  it("a mail outage never loses the message: it is retried later, and given up on visibly after 8 tries", async () => {
    const f = await makeForm({ notifications: { staffEmail: true, staffAddresses: "equip@apex.test" } });
    await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }));
    const down = { sendMail: async () => { throw new Error("SMTP down"); } };
    let now = new Date();
    expect(await processOutbox({ transport: down, now })).toEqual({ sent: 0, failed: 1 });
    let [row] = await db.select().from(outbox);
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    expect(row.lastError).toContain("SMTP down");
    expect(await processOutbox({ transport, now })).toEqual({ sent: 0, failed: 0 }); // not due yet: backoff
    now = new Date(now.getTime() + 2 * 60_000);
    expect(await processOutbox({ transport, now })).toEqual({ sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(await processOutbox({ transport, now })).toEqual({ sent: 0, failed: 0 }); // already sent: never twice

    await processSubmission(base(f, { [name.id]: "Bea", [email.id]: "bea@apex.test" }));
    for (let i = 0; i < 8; i++) { now = new Date(now.getTime() + 2 * 24 * 3600_000); await processOutbox({ transport: down, now }); }
    [row] = await db.select().from(outbox).where(eq(outbox.status, "dead"));
    expect(row.attempts).toBe(8);
  });
  it("email headers cannot be injected through the subject", async () => {
    const f = await makeForm({ notifications: { staffEmail: true, staffAddresses: "equip@apex.test" } });
    await db.update(forms).set({ name: "Contacte\r\nBcc: espia@evil.test" }).where(eq(forms.id, f.id));
    const [f2] = await db.select().from(forms).where(eq(forms.id, f.id));
    await processSubmission(base(f2, { [name.id]: "Ana", [email.id]: "ana@apex.test" }));
    await processOutbox({ transport });
    expect(sent[0].subject).not.toMatch(/[\r\n]/);
  });
  it("parses recipient lists safely", () => {
    expect(parseAddresses("a@x.test, b@x.test; a@x.test\nnot-an-email")).toEqual(["a@x.test", "b@x.test"]);
  });
});

describe("rate limit, retention, erasure, statistics", () => {
  it("limits one address to 5 submissions per form per 10 minutes", async () => {
    const f = await makeForm({ destination: "responses_only" });
    for (let i = 0; i < 5; i++) await processSubmission(base(f, { [name.id]: "A" + i, [email.id]: `a${i}@apex.test` }, { meta: { ...base(f, {}).meta, ipHash: "spammer", challengeId: crypto.randomUUID() } }));
    expect(await isRateLimited("spammer", f.id)).toBe(true);
    expect(await isRateLimited("someone-else", f.id)).toBe(false);
  });
  it("address hashes are dropped after 24 hours", async () => {
    const f = await makeForm({ destination: "responses_only" });
    await processSubmission(base(f, { [name.id]: "A", [email.id]: "a@apex.test" }));
    await db.execute(`update submissions set created_at = now() - interval '25 hours'` as never);
    await purgeIpHashes();
    expect((await db.select().from(submissions))[0].ipHash).toBeNull();
  });
  it("erasing a contact removes their leads, submissions, files and newsletter opt-in", async () => {
    const doc = field("file", { label: L("CV") });
    const f = await makeForm({ newsletter: { enabled: true, text: L("Butlletí") } }, [name, email, doc]);
    await processSubmission(base(f, { [name.id]: "Ana", [email.id]: "ana@apex.test" }, { newsletter: true, files: { [doc.id]: { name: "cv.pdf", bytes: Buffer.concat([Buffer.from("%PDF-1"), Buffer.alloc(50)]) } } }));
    await processSubmission(base(f, { [name.id]: "Bea", [email.id]: "bea@apex.test" }));
    const [ana] = await db.select().from(contacts).where(eq(contacts.email, "ana@apex.test"));
    const [sub] = await db.select().from(submissions).where(eq(submissions.contactId, ana.id));
    const key = (sub.answers.find((a) => a.type === "file")!.value as { key: string }).key;
    await eraseContact(ana.id);
    await expect(getPrivateBytes(key)).rejects.toThrow();
    expect(await db.select().from(contacts).where(eq(contacts.email, "ana@apex.test"))).toHaveLength(0);
    expect(await db.select().from(newsletterOptins)).toHaveLength(0);
    expect(await db.select().from(submissions)).toHaveLength(1); // Bea untouched
    expect(await db.select().from(leads)).toHaveLength(1);
  });
  it("completion rate is submissions over anonymous starts, never above 100%", async () => {
    const f = await makeForm({ destination: "responses_only" });
    expect(await formStats(f.id)).toEqual({ submissions: 0, starts: 0, completion: null });
    for (let i = 0; i < 4; i++) await recordStart(f.id);
    await processSubmission(base(f, { [name.id]: "A", [email.id]: "a@apex.test" }));
    expect(await formStats(f.id)).toEqual({ submissions: 1, starts: 4, completion: 0.25 });
    const [latest] = await db.select().from(submissions).orderBy(desc(submissions.createdAt));
    expect(latest).toBeTruthy();
  });
});
