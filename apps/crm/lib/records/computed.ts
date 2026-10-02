// Values a record shows that are not stored on it: counts and latest dates taken from the databases that point at it
// (people of a company, its last visit, events attended, fee tier). Loaded for a page of rows at once, never one query per row.
import { and, count, countDistinct, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@apex/db";
import { eventAttendance, feeTiers, members, people, visits } from "@apex/db/schema";
import type { Entity } from "./entity";

export type Computed = Record<string, Record<string, string | number | null>>; // record id -> column key -> value

export async function loadComputed(e: Entity, ids: string[]): Promise<Computed> {
  const out: Computed = Object.fromEntries(ids.map((id) => [id, {}]));
  if (e.key !== "companies" || ids.length === 0) return out;
  const [ppl, evs, vis, tiers] = await Promise.all([
    db.select({ id: people.companyId, n: count() }).from(people).where(and(inArray(people.companyId, ids), isNull(people.archivedAt))).groupBy(people.companyId),
    db.select({ id: eventAttendance.companyId, n: countDistinct(eventAttendance.eventId) }).from(eventAttendance).where(inArray(eventAttendance.companyId, ids)).groupBy(eventAttendance.companyId),
    db.select({ id: visits.companyId, d: max(visits.visitedOn) }).from(visits).where(inArray(visits.companyId, ids)).groupBy(visits.companyId),
    db.select({ id: members.companyId, tier: feeTiers.name }).from(members).leftJoin(feeTiers, eq(feeTiers.id, members.tierId)).where(and(inArray(members.companyId, ids), eq(members.status, "active"))),
  ]);
  for (const r of ppl) if (r.id) out[r.id].people = Number(r.n);
  for (const r of evs) if (r.id) out[r.id].events = Number(r.n);
  for (const r of vis) if (r.id) out[r.id].lastVisit = r.d;
  for (const r of tiers) if (r.id && r.tier) out[r.id].tier = r.tier;
  return out;
}
