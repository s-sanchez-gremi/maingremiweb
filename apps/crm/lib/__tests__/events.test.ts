import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { clients, eventAttendance, events, people, recordHistory, sponsors, suppliers, users, visits } from "@apex/db/schema";
import { listRecords, saveRecord, deleteRecord } from "../records/engine";
import { linkedRecords } from "../records/features";
import { ENTITIES } from "../records/registry";

const get = (o: Record<string, string>) => (k: string) => o[k];
const [EV, AT, SP, VI, PE, CO] = ["events", "attendance", "sponsors", "visits", "people", "companies"].map((k) => ENTITIES[k]);

beforeEach(async () => {
  for (const t of [eventAttendance, events, sponsors, visits, recordHistory, people, suppliers, clients, users]) await db.delete(t);
});

describe("events and attendance", () => {
  it("lists newest events first by default and validates the choices", async () => {
    await saveRecord(EV, null, get({ name: "Jornada vella", startsOn: "2025-03-01", kind: "conference", status: "done" }));
    await saveRecord(EV, null, get({ name: "Gala 2026", startsOn: "2026-11-20", kind: "gala", status: "planned", capacity: "300" }));
    expect((await listRecords(EV, {})).rows.map((r) => r.name)).toEqual(["Gala 2026", "Jornada vella"]);
    expect((await listRecords(EV, { dir: "asc" })).rows[0].name).toBe("Jornada vella");
    await expect(saveRecord(EV, null, get({ name: "X", kind: "party" }))).rejects.toThrow(/opció/);
    await expect(saveRecord(EV, null, get({ name: "X", startsOn: "2026-13-45" }))).rejects.toThrow(/data/);
  });
  it("an event shows who was invited and a person shows the events, by name", async () => {
    const ev = await saveRecord(EV, null, get({ name: "Gala 2026", startsOn: "2026-11-20" }));
    const co = await saveRecord(CO, null, get({ name: "Gràfiques Vila" }));
    const anna = await saveRecord(PE, null, get({ name: "Anna Puig", companyId: co }));
    await saveRecord(AT, null, get({ eventId: ev, personId: anna, companyId: co, status: "confirmed" }));
    const onEvent = (await linkedRecords(EV, ev)).find((l) => l.entity.key === "attendance")!;
    expect(onEvent.rows[0].text).toBe("Assistència · Confirmat · Anna Puig · Gràfiques Vila");
    const onPerson = (await linkedRecords(PE, anna)).find((l) => l.entity.key === "attendance")!;
    expect(onPerson.rows[0].text).toContain("Gala 2026");
    expect((await linkedRecords(CO, co)).map((l) => l.entity.key)).toEqual(expect.arrayContaining(["people", "attendance"]));
  });
  it("a person attends an event once; a missing event is refused", async () => {
    const ev = await saveRecord(EV, null, get({ name: "E" }));
    const p = await saveRecord(PE, null, get({ name: "Joan" }));
    await saveRecord(AT, null, get({ eventId: ev, personId: p }));
    await expect(saveRecord(AT, null, get({ eventId: ev, personId: p }))).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(saveRecord(AT, null, get({ personId: p, eventId: "" }))).rejects.toThrow(/obligatori/);
    await saveRecord(AT, null, get({ eventId: ev })); await saveRecord(AT, null, get({ eventId: ev })); // anonymous seats may repeat
  });
  it("deleting an event removes its attendance; deleting a person keeps the row", async () => {
    const ev = await saveRecord(EV, null, get({ name: "E" }));
    const p = await saveRecord(PE, null, get({ name: "Joan" }));
    await saveRecord(AT, null, get({ eventId: ev, personId: p }));
    await deleteRecord(PE, p);
    expect((await db.select().from(eventAttendance))[0].personId).toBeNull();
    await deleteRecord(EV, ev);
    expect(await db.select().from(eventAttendance)).toHaveLength(0);
  });
  it("attendance keeps no change history", async () => {
    const ev = await saveRecord(EV, null, get({ name: "E" }));
    const id = await saveRecord(AT, null, get({ eventId: ev }));
    await saveRecord(AT, id, get({ eventId: ev, status: "attended" }));
    expect((await db.select().from(recordHistory)).filter((h) => h.entity === "attendance")).toHaveLength(0);
  });
});

describe("sponsors and visits", () => {
  it("stores amount in cents, an optional level and the links to a company and an ERP supplier", async () => {
    const [s] = await db.insert(suppliers).values({ name: "Banc" }).returning();
    const co = await saveRecord(CO, null, get({ name: "Banc SA" }));
    const id = await saveRecord(SP, null, get({ name: "Gala 2026 · Banc", level: "gold", year: "2026", amountCents: "5.000,50", companyId: co, supplierId: s.id, status: "confirmed" }));
    const [row] = (await listRecords(SP, {})).rows;
    expect(row).toMatchObject({ id, level: "gold", year: 2026, amountCents: 500050, status: "confirmed" });
    await saveRecord(SP, id, get({ name: "Gala 2026 · Banc", level: "" }));
    expect((await listRecords(SP, {})).rows[0].level).toBeNull();
    expect((await linkedRecords(ENTITIES.suppliers, s.id)).map((l) => l.entity.key)).toContain("sponsors");
  });
  it("visits link to a company, newest first, and show on the company page", async () => {
    const co = await saveRecord(CO, null, get({ name: "Vila" }));
    await saveRecord(VI, null, get({ subject: "Primera visita", companyId: co, visitedOn: "2026-01-10", kind: "new_member", status: "done" }));
    await saveRecord(VI, null, get({ subject: "Seguiment", companyId: co, visitedOn: "2026-05-02", followUpOn: "2026-06-01" }));
    expect((await listRecords(VI, {})).rows.map((r) => r.subject)).toEqual(["Seguiment", "Primera visita"]);
    expect((await listRecords(VI, { filters: { status: "done" } })).total).toBe(1);
    expect((await linkedRecords(CO, co)).find((l) => l.entity.key === "visits")?.total).toBe(2);
  });
});
