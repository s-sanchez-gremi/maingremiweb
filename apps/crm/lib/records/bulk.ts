"use server";
// Actions on several selected rows of a workspace table: change a status, invite to an event, archive. Same permission, validation and
// history as editing one record (every row goes through saveField / setArchived); a row that is refused is counted, not fatal.
import { requireUser } from "@apex/core/auth";
import { saveField, setArchived } from "./engine";
import { RecordError } from "./fieldTypes";
import { inviteRows, Ids, type BulkResult } from "./bulk-core";
import { screenEntity } from "./registry";

export type { BulkResult } from "./bulk-core";

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
  let done = 0, skipped = 0;
  for (const id of Ids.parse(ids)) {
    try { await setArchived(e, id, true, user); done++; }
    catch (err) { if (err instanceof RecordError) skipped++; else throw err; }
  }
  return { ok: true, done, skipped };
}

/** Invites the selected companies or people to an event: one attendance row each, unless they already have one for that event. */
export async function bulkInviteAction(entity: string, ids: string[], eventId: string, status: string): Promise<BulkResult> {
  const { e } = await allowed(entity);
  if (!e.bulk?.invite) return { ok: false, done: 0, skipped: 0, error: "Acció no disponible" };
  if (!["invited", "confirmed"].includes(status)) return { ok: false, done: 0, skipped: 0, error: "Estat no vàlid" };
  return inviteRows(entity, eventId, ids, status);
}

