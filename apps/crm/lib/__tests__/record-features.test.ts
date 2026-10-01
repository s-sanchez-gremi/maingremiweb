import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { members, subscriptions, suppliers, users, recordFiles, recordNotes, recordHistory, erpCategories, costCenters, feeTiers, erpEntries } from "@apex/db/schema";
import { deleteRecord, getRecord, listRecords, saveRecord, setArchived } from "../records/engine";
import { addFile, addNote, FeatureError, linkedRecords, listFiles, listHistory, listNotes } from "../records/features";
import { ENTITIES } from "../records/registry";

const get = (o: Record<string, string>) => (k: string) => o[k];
const S = ENTITIES.suppliers, SUB = ENTITIES.subscriptions;
let actor: { id: string; email: string };
beforeEach(async () => {
  for (const t of [recordFiles, recordNotes, recordHistory, erpEntries, subscriptions, members, feeTiers, suppliers, costCenters, erpCategories, users]) await db.delete(t);
  const [u] = await db.insert(users).values({ email: "a@x.test", passwordHash: "x", role: "admin" }).returning();
  actor = { id: u.id, email: u.email };
});

describe("record features", () => {
  it("logs creation and field-by-field changes with the author, ignoring unchanged saves", async () => {
    const id = await saveRecord(S, null, get({ name: "Papereria", taxId: "B1" }), actor);
    await saveRecord(S, id, get({ name: "Papereria", taxId: "B1" }), actor); // nothing changed
    await saveRecord(S, id, get({ name: "Papereria SL", taxId: "B1", phone: "93 123 45 67" }), actor);
    const h = await listHistory(S, id);
    expect(h.map((x) => x.action)).toEqual(["update", "create"]);
    expect(h[0].userName).toBe("a@x.test");
    expect(h[0].changes).toEqual([{ field: "name", label: "Nom", from: "Papereria", to: "Papereria SL" }, { field: "phone", label: "Telèfon", from: "", to: "93 123 45 67" }]);
  });
  it("history keeps relation names, not ids", async () => {
    const [a] = await db.insert(suppliers).values({ name: "Alfa" }).returning(); const [b] = await db.insert(suppliers).values({ name: "Beta" }).returning();
    const id = await saveRecord(SUB, null, get({ name: "Adobe", amountCents: "10,00", supplierId: a.id, period: "annual" }), actor);
    await saveRecord(SUB, id, get({ name: "Adobe", amountCents: "10,00", supplierId: b.id, period: "annual" }), actor);
    expect((await listHistory(SUB, id))[0].changes).toEqual([{ field: "supplierId", label: "Proveïdor", from: "Alfa", to: "Beta" }]);
  });
  it("notes: stored with author, refuse empty and oversized", async () => {
    const id = await saveRecord(S, null, get({ name: "X" }), actor);
    await addNote(S, id, "  Trucada amb el gerent  ", actor);
    expect((await listNotes(S, id))[0]).toMatchObject({ body: "Trucada amb el gerent", authorName: "a@x.test" });
    await expect(addNote(S, id, "   ", actor)).rejects.toThrow(FeatureError);
    await expect(addNote(S, id, "x".repeat(4001), actor)).rejects.toThrow(/llarga/);
  });
  it("files: only real PDFs/images are accepted", async () => {
    const id = await saveRecord(S, null, get({ name: "X" }), actor);
    await expect(addFile(S, id, new File([Buffer.from("MZ not a document")], "virus.pdf"), actor.id)).rejects.toThrow(FeatureError);
    expect(await listFiles(S, id)).toHaveLength(0);
  });
  it("archive hides a record from the list, restore brings it back, both are logged", async () => {
    const id = await saveRecord(S, null, get({ name: "Vell" }), actor);
    await setArchived(S, id, true, actor);
    expect((await listRecords(S, {})).total).toBe(0);
    expect((await listRecords(S, { archived: true })).rows.map((r) => r.name)).toEqual(["Vell"]);
    await setArchived(S, id, false, actor);
    expect((await listRecords(S, {})).total).toBe(1);
    expect((await listHistory(S, id)).map((x) => x.action)).toEqual(["restore", "archive", "create"]);
    await expect(setArchived(ENTITIES.categories, id, true)).rejects.toThrow(/archivable/);
  });
  it("linked records show up on the other side, archived ones do not", async () => {
    const [s] = await db.insert(suppliers).values({ name: "Adobe" }).returning();
    await db.insert(subscriptions).values([{ name: "Creative Cloud", supplierId: s.id, amountCents: 100 }, { name: "Acrobat", supplierId: s.id, amountCents: 50 }]);
    const l = await linkedRecords(S, s.id);
    expect(l).toHaveLength(1);
    expect([l[0].entity.key, l[0].field, l[0].total]).toEqual(["subscriptions", "supplierId", 2]);
    expect(await linkedRecords(ENTITIES["fee-tiers"], s.id)).toEqual([]);
  });
  it("deleting a record removes its notes, files rows and history", async () => {
    const id = await saveRecord(S, null, get({ name: "Temporal" }), actor);
    await addNote(S, id, "nota", actor);
    await deleteRecord(S, id);
    expect(await getRecord(S, id)).toBeNull();
    for (const t of [recordNotes, recordFiles, recordHistory]) expect(await db.select().from(t)).toHaveLength(0);
  });
});
