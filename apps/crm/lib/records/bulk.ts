"use server";
// Actions on several selected rows of a workspace table: change a status, invite to an event, archive. Same permission, validation and
// history as editing one record (every row goes through saveField / setArchived); a row that is refused is counted, not fatal.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@apex/db";
import { eventAttendance, people } from "@apex/db/schema";
import { requireUser } from "@apex/core/auth";
import { saveField, setArchived } from "./engine";
import { RecordError } from "./fieldTypes";
import { screenEntity } from "./registry";

const Ids = z.array(z.string().uuid()).min(1).max(500);
export type BulkResult = { ok: boolean; done: number; skipped: number; error?: string };

async function allowed(entity: string) {
  const e = screenEntity(entity);
  if (!e) throw new Error("Unknown list");
  const user = await requireUser(e.perm);
  return { e, user };
}

export async function bulkSetAction(entity: string, ids: string[], field: string, value: string): Promise<BulkResult> {
  const { e, user } = await allowed(entity);
  if (e.fields.find((f) => f.name === field)?.type !== "select") return { ok: false, done: 0, skipped: 0, error: "Camp no vàlid" };
  let done = 0, skipped = 0;
  for (const id of Ids.parse(ids)) {
    try { await saveField(e, id, field, value, user); done++; }
    catch (err) { if (err instanceof RecordError) skipped++; else throw err; }
  }
  return { ok: true, done, skipped };
}

export async function bulkArchiveAction(entity: string, ids: string[]): Promise<BulkResult> {
  const { e, user } = await allowed(entity);
  if (!e.archivable) return { ok: false, done: 0, skipped: 0, error: "Aquesta llista no s'arxiva" };
  const list = Ids.parse(ids);
  for (const id of list) await setArchived(e, id, true, user);
  return { ok: true, done: list.length, skipped: 0 };
}

/** Invites the selected companies or people to an event: one attendance row each, unless they already have one for that event. */
export async function bulkInviteAction(entity: string, ids: string[], eventId: string, status: string): Promise<BulkResult> {
  const { e } = await allowed(entity);
  if (!e.bulk?.invite) return { ok: false, done: 0, skipped: 0, error: "Acció no disponible" };
  const event = z.string().uuid().parse(eventId);
  if (!["invited", "confirmed"].includes(status)) return { ok: false, done: 0, skipped: 0, error: "Estat no vàlid" };
  const list = Ids.parse(ids);
  const have = await db.select({ p: eventAttendance.personId, c: eventAttendance.companyId }).from(eventAttendance).where(eq(eventAttendance.eventId, event));
  let rows: { eventId: string; personId?: string; companyId?: string | null; status: string }[];
  if (entity === "people") {
    const got = new Set(have.map((h) => h.p).filter(Boolean));
    const found = await db.select({ id: people.id, c: people.companyId }).from(people).where(and(inArray(people.id, list), isNull(people.archivedAt)));
    rows = found.filter((p) => !got.has(p.id)).map((p) => ({ eventId: event, personId: p.id, companyId: p.c, status }));
  } else {
    const got = new Set(have.map((h) => h.c).filter(Boolean));
    rows = list.filter((id) => !got.has(id)).map((id) => ({ eventId: event, companyId: id, status }));
  }
  if (rows.length) await db.insert(eventAttendance).values(rows);
  return { ok: true, done: rows.length, skipped: list.length - rows.length };
}
