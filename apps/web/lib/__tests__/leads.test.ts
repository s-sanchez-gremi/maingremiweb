import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { clients, contacts, forms, leadNotes, leads, submissions, users } from "@/db/schema";
import { addNote, convertToClient, isStatus, listLeads, setOwner, setStatus } from "../leads";
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
    expect((await listLeads({ q: "%" })).total).toBe(0); // wildcards are literal
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
