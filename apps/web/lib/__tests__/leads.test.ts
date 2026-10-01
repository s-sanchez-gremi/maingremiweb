import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, contacts, forms, leadNotes, leads, submissions, users } from "@apex/db/schema";
import { addNote, convertToClient, isStatus, listLeads, listPeople, setOwner, setStatus } from "../leads";
import { eraseContact } from "../forms/admin-data";

let uid: string, formId: string;
async function lead(email: string, extra: Partial<typeof contacts.$inferInsert> = {}) {
  const [c] = await db.insert(contacts).values({ email, ...extra }).returning();
  const [s] = await db.insert(submissions).values({ formId, contactId: c.id, answers: [], locale: "ca" }).returning();
  const [l] = await db.insert(leads).values({ contactId: c.id, formId, submissionId: s.id, locale: "ca" }).returning();
  return { c, l };
}
beforeEach(async () => {
  await db.delete(contacts); await db.delete(clients); await db.delete(forms); await db.delete(users);
  [{ id: uid }] = await db.insert(users).values({ email: "staff@x.test", passwordHash: "x", role: "editor" }).returning({ id: users.id });
  [{ id: formId }] = await db.insert(forms).values({ slug: "f", name: "F", fields: [], consent: {}, notifications: {} } as never).returning({ id: forms.id });
});

describe("lead search and people view", () => {
  it("finds by phone, note text and answer text (accent-insensitive), not by field names", async () => {
    const a = await lead("ana@x.test", { name: "Ana", phone: "600111222" });
    await db.update(submissions).set({ answers: [{ id: "q1", type: "longtext", label: "Missatge", value: "Necessito un pressupost d'impressió" }] }).where(eq(submissions.contactId, a.c.id));
    await addNote(a.l.id, uid, "Va demanar catàleg");
    await lead("bob@x.test", { name: "Bob" });
    expect((await listLeads({ q: "600111" })).rows).toHaveLength(1);
    expect((await listLeads({ q: "impressio pressupost" })).rows).toHaveLength(1);
    expect((await listLeads({ q: "catalag" })).total).toBe(0);
    expect((await listLeads({ q: "catalèg" })).rows).toHaveLength(1);
    expect((await listLeads({ q: "missatge" })).total).toBe(0); // labels are not searched
    expect((await listLeads({ q: "longtext" })).total).toBe(0);
  });
  it("people view: one row per contact with request count and latest status", async () => {
    const a = await lead("ana@x.test", { name: "Ana" });
    const [s2] = await db.insert(submissions).values({ formId, contactId: a.c.id, answers: [], locale: "ca" }).returning();
    const [l2] = await db.insert(leads).values({ contactId: a.c.id, formId, submissionId: s2.id, locale: "ca" }).returning();
    await setStatus(l2.id, "qualified");
    await lead("bob@x.test");
    const r = await listPeople({});
    expect(r.total).toBe(2);
    const ana = r.rows.find((x) => x.c.email === "ana@x.test")!;
    expect([ana.requests, ana.latestStatus, ana.latestLeadId]).toEqual([2, "qualified", l2.id]);
    expect((await listPeople({ q: "ana" })).rows).toHaveLength(1);
    expect((await listPeople({ status: "qualified" })).total).toBe(1);
  });
});

describe("lead management", () => {
  it("validates status, sets status and owner", async () => {
    const { l } = await lead("a@x.test");
    expect(isStatus("won")).toBe(true); expect(isStatus("hacked")).toBe(false);
    await setStatus(l.id, "contacted"); await setOwner(l.id, uid);
    const [r] = await db.select().from(leads).where(eq(leads.id, l.id));
    expect([r.status, r.ownerId]).toEqual(["contacted", uid]);
    await expect(db.update(leads).set({ status: "bogus" }).where(eq(leads.id, l.id))).rejects.toThrow(); // database check constraint
  });
  it("filters by status, owner and text, and pages", async () => {
    const a = await lead("ana@x.test", { name: "Ana Puig", company: "Gràfiques Puig" }), b = await lead("bob@x.test", { name: "Bob" });
    await setStatus(a.l.id, "qualified"); await setOwner(a.l.id, uid);
    expect((await listLeads({})).total).toBe(2);
    expect((await listLeads({ status: "qualified" })).rows.map((r) => r.c.email)).toEqual(["ana@x.test"]);
    expect((await listLeads({ owner: "none" })).rows.map((r) => r.c.email)).toEqual(["bob@x.test"]);
    expect((await listLeads({ q: "puig" })).rows).toHaveLength(1);
    expect((await listLeads({ q: "%%" })).total).toBe(0); // wildcards are literal
    expect((await listLeads({ status: "not-a-status" })).total).toBe(2); // unknown filter ignored, not an error
    void b;
  });
  it("adds notes (blank ignored) and converts once to a client", async () => {
    const { c, l } = await lead("eva@x.test", { name: "Eva", company: "Eva SL", phone: "600" });
    expect(await addNote(l.id, uid, "  ")).toBe(false);
    expect(await addNote(l.id, uid, "Trucar")).toBe(true);
    expect(await db.select().from(leadNotes)).toHaveLength(1);
    const c1 = await convertToClient(l.id), c2 = await convertToClient(l.id);
    expect(c1).toBe(c2);
    const [cl] = await db.select().from(clients);
    expect([cl.name, cl.email, cl.contactId]).toEqual(["Eva SL", "eva@x.test", c.id]);
    expect((await db.select().from(leads))[0].status).toBe("won");
  });
  it("erasing a contact also erases notes and the client made from them", async () => {
    const { c, l } = await lead("z@x.test");
    await addNote(l.id, uid, "nota"); await convertToClient(l.id);
    await eraseContact(c.id);
    expect(await db.select().from(leadNotes)).toHaveLength(0);
    expect(await db.select().from(clients)).toHaveLength(0);
  });
});
