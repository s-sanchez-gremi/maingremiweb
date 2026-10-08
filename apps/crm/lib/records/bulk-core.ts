// Shared logic behind the bulk actions in bulk.ts. Deliberately NOT a "use server" module: anything exported from a server-action file
// becomes an endpoint callable by anyone, and these functions do no permission check (the actions do it before calling them).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { clients, eventAttendance, people } from "@apex/db/schema";

export const Ids = z.array(z.string().uuid()).min(1).max(500);
export type BulkResult = { ok: boolean; done: number; skipped: number; error?: string };

/** The attendance rows a bulk invite would create. Archived and unknown companies or people are skipped, as are those already invited. */
export async function inviteRows(entity: string, eventId: string, ids: string[], status: string): Promise<BulkResult> {
  const event = z.string().uuid().parse(eventId);
  const list = [...new Set(Ids.parse(ids))];
  const have = await db.select({ p: eventAttendance.personId, c: eventAttendance.companyId }).from(eventAttendance).where(eq(eventAttendance.eventId, event));
  let rows: { eventId: string; personId?: string; companyId?: string | null; status: string }[];
  if (entity === "people") {
    const got = new Set(have.map((h) => h.p).filter(Boolean));
    const found = await db.select({ id: people.id, c: people.companyId }).from(people).where(and(inArray(people.id, list), isNull(people.archivedAt)));
    rows = found.filter((p) => !got.has(p.id)).map((p) => ({ eventId: event, personId: p.id, companyId: p.c, status }));
  } else {
    const got = new Set(have.map((h) => h.c).filter(Boolean));
    const found = await db.select({ id: clients.id }).from(clients).where(and(inArray(clients.id, list), isNull(clients.archivedAt)));
    const live = new Set(found.map((c) => c.id));
    rows = list.filter((id) => live.has(id) && !got.has(id)).map((id) => ({ eventId: event, companyId: id, status }));
  }
  if (rows.length) await db.insert(eventAttendance).values(rows);
  return { ok: true, done: rows.length, skipped: list.length - rows.length };
}
