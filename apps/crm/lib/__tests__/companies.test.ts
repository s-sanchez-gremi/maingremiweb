import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, members, people, projects, recordHistory, users } from "@apex/db/schema";
import { getRecord, listRecords, saveRecord } from "../records/engine";
import { linkedRecords } from "../records/features";
import { ENTITIES } from "../records/registry";

const get = (o: Record<string, string>) => (k: string) => o[k];
const C = ENTITIES.companies, P = ENTITIES.people;

beforeEach(async () => {
  for (const t of [recordHistory, people, projects, members, clients, users]) await db.delete(t);
});

describe("companies", () => {
  it("stores the Notion fields and keeps clients' defaults for older rows", async () => {
    const id = await saveRecord(C, null, get({ name: "Gràfiques Vila SL", memberStatus: "member", taxId: "B12345678", employees: "12", foundedYear: "1987", getsMagazine: "on", website: "https://vila.example", activity: "Impremta" }));
    expect(await getRecord(C, id)).toMatchObject({ name: "Gràfiques Vila SL", memberStatus: "member", employees: 12, foundedYear: 1987, getsMagazine: true, email: "" });
    const [old] = await db.insert(clients).values({ name: "Client antic" }).returning();
    expect(old).toMatchObject({ memberStatus: "prospect", taxId: "", archivedAt: null });
  });
  it("refuses a second company with the same tax id, ignoring case and spaces", async () => {
    await saveRecord(C, null, get({ name: "A", taxId: "B 123 456 78" }));
    await expect(saveRecord(C, null, get({ name: "B", taxId: "b12345678" }))).rejects.toMatchObject({ cause: { code: "23505" } });
    await saveRecord(C, null, get({ name: "C", taxId: "" })); await saveRecord(C, null, get({ name: "D", taxId: "" })); // blank ids never clash
    expect((await listRecords(C, {})).total).toBe(3);
  });
  it("validates numbers, urls and the member status", async () => {
    await expect(saveRecord(C, null, get({ name: "X", website: "vila.example" }))).rejects.toThrow(/http/);
    await expect(saveRecord(C, null, get({ name: "X", employees: "-3" }))).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(saveRecord(C, null, get({ name: "X", memberStatus: "vip" }))).rejects.toThrow(/opció/);
  });
  it("searches across name, tax id, city and activity", async () => {
    await saveRecord(C, null, get({ name: "Gràfiques Vila", taxId: "B1", city: "Terrassa", activity: "Impremta offset" }));
    await saveRecord(C, null, get({ name: "Altres SL", taxId: "B2", city: "Girona" }));
    for (const q of ["grafiques", "b1", "terrassa", "offset"]) expect((await listRecords(C, { q })).rows.map((r) => r.name)).toEqual(["Gràfiques Vila"]);
    expect((await listRecords(C, { filters: { memberStatus: "prospect" } })).total).toBe(2);
  });
  it("a parent company is a relation to another company", async () => {
    const parent = await saveRecord(C, null, get({ name: "Grup" }));
    const child = await saveRecord(C, null, get({ name: "Filial", parentCompanyId: parent }));
    expect((await getRecord(C, child))?.parentCompanyId).toBe(parent);
    expect((await linkedRecords(C, parent)).find((l) => l.field === "parentCompanyId")?.rows.map((r) => r.text)).toEqual(["Filial"]);
  });
});

describe("people and links", () => {
  it("a company lists its people and its ERP member, both ways", async () => {
    const co = await saveRecord(C, null, get({ name: "Gràfiques Vila", taxId: "B1" }));
    await saveRecord(P, null, get({ name: "Anna Puig", role: "Gerent", companyId: co, email: "anna@vila.example" }));
    await saveRecord(ENTITIES.members, null, get({ name: "Gràfiques Vila", companyId: co, status: "active", billingPeriod: "annual" }));
    const l = await linkedRecords(C, co);
    expect(l.map((x) => `${x.entity.key}.${x.field}`).sort()).toEqual(["members.companyId", "people.companyId"]);
    expect(l.find((x) => x.entity.key === "people")?.rows[0].text).toBe("Anna Puig · Gerent");
  });
  it("deleting a company keeps its people, unlinked", async () => {
    const co = await saveRecord(C, null, get({ name: "Temporal" }));
    const p = await saveRecord(P, null, get({ name: "Joan", companyId: co }));
    await db.delete(clients).where(eq(clients.id, co));
    expect((await getRecord(P, p))?.companyId).toBeNull();
  });
  it("archived people do not show up as linked records", async () => {
    const co = await saveRecord(C, null, get({ name: "Co" }));
    const p = await saveRecord(P, null, get({ name: "Marta", companyId: co }));
    await db.update(people).set({ archivedAt: new Date() }).where(eq(people.id, p));
    expect((await linkedRecords(C, co)).filter((l) => l.entity.key === "people")).toEqual([]);
  });
});
