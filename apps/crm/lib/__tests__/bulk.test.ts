import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, eventAttendance, events, people, recordHistory } from "@apex/db/schema";
import { saveRecord, setArchived } from "../records/engine";
import { inviteRows } from "../records/bulk-core";
import { RecordError } from "../records/fieldTypes";
import { ENTITIES } from "../records/registry";

const get = (o: Record<string, string>) => (k: string) => o[k];
const CO = ENTITIES.companies, EV = ENTITIES.events;

beforeEach(async () => {
  for (const t of [eventAttendance, events, recordHistory, people, clients]) await db.delete(t);
});

describe("bulk archive", () => {
  it("refuses a record that no longer exists and writes no history for it", async () => {
    const ghost = crypto.randomUUID();
    await expect(setArchived(CO, ghost, true)).rejects.toBeInstanceOf(RecordError);
    expect(await db.select().from(recordHistory).where(eq(recordHistory.recordId, ghost))).toEqual([]);
  });

  it("still archives a live record and logs the change", async () => {
    const id = await saveRecord(CO, null, get({ name: "Gràfiques Vila", taxId: "B12345678" }));
    await setArchived(CO, id, true);
    const [row] = await db.select().from(clients).where(eq(clients.id, id));
    expect(row.archivedAt).not.toBeNull();
    const actions = (await db.select().from(recordHistory).where(eq(recordHistory.recordId, id))).map((h) => h.action);
    expect(actions).toContain("archive");
  });
});

describe("bulk invite to an event", () => {
  it("invites only live companies, each once, and counts the rest as skipped", async () => {
    const ev = await saveRecord(EV, null, get({ name: "Gala 2026", startsOn: "2026-11-20", kind: "gala", status: "planned" }));
    const live = await saveRecord(CO, null, get({ name: "Viva SA", taxId: "A11111111" }));
    const old = await saveRecord(CO, null, get({ name: "Tancada SL", taxId: "B22222222" }));
    await setArchived(CO, old, true);
    const ghost = crypto.randomUUID();

    expect(await inviteRows("companies", ev, [live, live, old, ghost], "invited")).toMatchObject({ done: 1, skipped: 2 });
    const rows = await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, ev));
    expect(rows.map((r) => r.companyId)).toEqual([live]);

    expect(await inviteRows("companies", ev, [live], "invited")).toMatchObject({ done: 0, skipped: 1 });
  });
});
