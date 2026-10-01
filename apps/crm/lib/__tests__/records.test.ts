import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { members, feeTiers, subscriptions, suppliers, costCenters, erpCategories, erpEntries, users } from "@apex/db/schema";
import { deleteRecord, getRecord, listRecords, recordsToCsv, relationChoices, saveRecord, PAGE_SIZE } from "../records/engine";
import { RecordError, parseFields, type Field } from "../records/fieldTypes";
import { ENTITIES } from "../records/registry";

const get = (o: Record<string, string>) => (k: string) => o[k];
const E = (k: string) => ENTITIES[k];

beforeEach(async () => {
  for (const t of [erpEntries, subscriptions, members, feeTiers, suppliers, costCenters, erpCategories, users]) await db.delete(t);
});

describe("field types", () => {
  const fields: Field[] = [
    { name: "name", label: "Nom", type: "text", required: true }, { name: "email", label: "Correu", type: "email" }, { name: "amount", label: "Import", type: "money" },
    { name: "vat", label: "IVA", type: "percent" }, { name: "day", label: "Dia", type: "date" }, { name: "on", label: "Activa", type: "checkbox" }, { name: "n", label: "N", type: "number" },
    { name: "web", label: "Web", type: "url" }, { name: "kind", label: "Tipus", type: "select", choices: [["a", "A"], ["b", "B"]] },
  ];
  it("converts values: cents, basis points, null for empty dates, '' for empty text", () => {
    expect(parseFields(fields, get({ name: " Acme ", amount: "1.234,56", vat: "21", day: "", n: "7", on: "on" }))).toMatchObject({ name: "Acme", amount: 123456, vat: 2100, day: null, n: 7, on: true });
    expect(parseFields(fields, get({ name: "A", email: "" }))).toMatchObject({ email: "", on: false });
  });
  it("refuses bad values with a readable message", () => {
    const bad = (o: Record<string, string>) => () => parseFields(fields, get({ name: "A", ...o }));
    expect(bad({ email: "nope" })).toThrow(RecordError);
    expect(bad({ amount: "12,345" })).toThrow(/import/);
    expect(bad({ vat: "120" })).toThrow(/percentatge/);
    expect(bad({ day: "10/03/2026" })).toThrow(/data/);
    expect(bad({ web: "javascript:alert(1)" })).toThrow(/http/);
    expect(bad({ kind: "z" })).toThrow(/opció/);
    expect(bad({ n: "1.5" })).toThrow(/enter/);
    expect(() => parseFields(fields, get({ name: " " }))).toThrow(/obligatori/);
  });
  it("leaves fields that are not in the form untouched", () => {
    expect(Object.keys(parseFields(fields, get({ name: "A" })))).not.toContain("amount");
  });
});

describe("engine on the ERP lists", () => {
  it("creates, reads, updates and deletes through one code path", async () => {
    const e = E("suppliers");
    const id = await saveRecord(e, null, get({ name: "Papereria SL", taxId: "B123", email: "a@b.cat" }));
    expect(await getRecord(e, id)).toMatchObject({ name: "Papereria SL", taxId: "B123", phone: "" });
    await saveRecord(e, id, get({ name: "Papereria 2", taxId: "B123" }));
    expect((await getRecord(e, id))?.name).toBe("Papereria 2");
    await deleteRecord(e, id);
    expect(await getRecord(e, id)).toBeNull();
  });
  it("searches accent-insensitively across the declared columns, filters and sorts", async () => {
    const e = E("members");
    await saveRecord(e, null, get({ name: "Col·legi Gràfic", taxId: "A1", status: "active", billingPeriod: "annual" }));
    await saveRecord(e, null, get({ name: "Bar Zeta", status: "left", billingPeriod: "quarterly" }));
    await saveRecord(e, null, get({ name: "Alfa SL", taxId: "Q99", status: "active", billingPeriod: "quarterly" }));
    expect((await listRecords(e, { q: "collegi grafic" })).rows.map((r) => r.name)).toEqual(["Col·legi Gràfic"]);
    expect((await listRecords(e, { q: "q99" })).total).toBe(1);
    expect((await listRecords(e, { filters: { status: "active" } })).rows.map((r) => r.name)).toEqual(["Alfa SL", "Col·legi Gràfic"]);
    expect((await listRecords(e, { filters: { status: "active", billingPeriod: "quarterly" } })).rows.map((r) => r.name)).toEqual(["Alfa SL"]);
    expect((await listRecords(e, { sort: "name", dir: "desc" })).rows[0].name).toBe("Col·legi Gràfic");
    expect((await listRecords(e, { filters: { notAField: "x", name: "Alfa SL" } })).total).toBe(3); // unknown / non-filter fields are ignored
    expect((await listRecords(e, { sort: "name; drop table members" })).total).toBe(3); // unknown sort falls back to the default
  });
  it("pages and exports every row, with relations shown by name and formulas neutralised", async () => {
    const [t] = await db.insert(feeTiers).values({ name: "Tram A", annualCents: 10000 }).returning();
    const e = E("members");
    for (let i = 0; i < PAGE_SIZE + 5; i++) await saveRecord(e, null, get({ name: `=Soci ${String(i).padStart(3, "0")}`, tierId: t.id, status: "active", billingPeriod: "annual" }));
    const p1 = await listRecords(e, {}); const p2 = await listRecords(e, { page: 2 });
    expect([p1.rows.length, p2.rows.length, p1.total, p1.pages]).toEqual([PAGE_SIZE, 5, PAGE_SIZE + 5, 2]);
    const all = await listRecords(e, {}, { all: true });
    const csv = recordsToCsv(e, all.rows, await relationChoices(e));
    expect(csv.split("\r\n")).toHaveLength(PAGE_SIZE + 5 + 2);
    expect(csv).toContain("'=Soci 000");
    expect(csv).toContain("Tram A");
  });
  it("relation choices honour the target's filter and label column", async () => {
    await db.insert(erpCategories).values([{ kind: "expense", name: "Paper" }, { kind: "income", name: "Quotes" }]);
    await db.insert(users).values({ email: "a@x.test", passwordHash: "x", role: "admin" });
    const c = await relationChoices(E("subscriptions"));
    expect(c['categories|{"kind":"expense"}'].map((o) => o.label)).toEqual(["Paper"]);
    expect(c["users|{}"].map((o) => o.label)).toEqual(["a@x.test"]);
  });
  it("rejects a relation that is not a uuid", async () => {
    await expect(saveRecord(E("members"), null, get({ name: "X", tierId: "1; drop" }))).rejects.toThrow(RecordError);
  });
});
