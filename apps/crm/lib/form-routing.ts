// Records as a form destination, CRM side. A form whose destination is "records" stores each response with routing_status = 'pending' (the Forms app never
// writes CRM tables for this); this file, run by the CRM scheduler, turns every pending response into CRM records THROUGH THE RECORDS ENGINE, so the same
// validation, the same change history and the same de-duplication apply as when a person types the record. What can be created is declared in
// packages/forms/src/routing.ts, shared with the Forms app.
//   - an existing person (found by email) is only COMPLETED (blanks filled), never overwritten: the CRM is the source of truth;
//   - a record is created once per response (its external_ref is "form:<response id>"), so a retry after a crash never duplicates it;
//   - a mapping or data problem fails at once with a message staff can read; an unexpected error is retried up to 3 times.
import { and, count, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, eventAttendance, events, forms, jobSeekers, labourCases, people, submissions, trainingCourses } from "@apex/db/schema";
import { answerText } from "@apex/forms/answer-text";
import { checkRouting, fixedValue, normalizeRouting, routingTarget, type Routing } from "@apex/forms/routing";
import type { Item } from "@apex/forms/fieldTypes";
import { saveRecord, type Actor } from "./records/engine";
import { entityByKey } from "./records/registry";
import { RecordError } from "./records/fieldTypes";

type FormRow = typeof forms.$inferSelect;
type Sub = typeof submissions.$inferSelect;
export type Routed = { entity: string; id: string; label: string; action: "created" | "updated" | "unchanged" };

/** A problem with the form's setup or the response that retrying will not fix. */
export class RoutingError extends Error {}
const MAX_ATTEMPTS = 3;

const entity = (key: string) => { const e = entityByKey(key); if (!e) throw new RoutingError(`Entitat desconeguda: ${key}`); return e; };
const day = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (isoDay: string, months: number) => { const d = new Date(`${isoDay}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); return day(d); };

/** An existing company with exactly this name, or null: a name that matches none or several is not guessed. */
async function companyIdByName(name: string): Promise<string | null> {
  if (!name) return null;
  const rows = await db.select({ id: clients.id }).from(clients).where(and(sql`lower(btrim(${clients.name})) = lower(btrim(${name}))`, isNull(clients.archivedAt))).limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

type PersonValues = { name: string; email: string; phone: string; role: string; company: string; notes: string };

/** Creates the person, or completes the one with this email (only blank values are filled in). */
async function upsertPerson(v: PersonValues, form: FormRow, actor: Actor): Promise<Routed> {
  const e = entity("people");
  const email = v.email.trim().toLowerCase();
  const companyId = await companyIdByName(v.company);
  const [existing] = email ? await db.select().from(people).where(and(sql`lower(btrim(${people.email})) = ${email}`, isNull(people.archivedAt))).limit(1) : [];
  if (existing) {
    const fill = (current: string, next: string) => (current.trim() || !next ? undefined : next);
    const patch: Record<string, string | undefined> = {
      name: fill(existing.name, v.name), phone: fill(existing.phone, v.phone), role: fill(existing.role, v.role), notes: fill(existing.notes, v.notes),
      companyId: existing.companyId || !companyId ? undefined : companyId,
    };
    if (Object.values(patch).every((x) => x === undefined)) return { entity: "people", id: existing.id, label: existing.name, action: "unchanged" };
    await saveRecord(e, existing.id, (n) => patch[n], actor);
    return { entity: "people", id: existing.id, label: existing.name, action: "updated" };
  }
  const values: Record<string, string> = { name: v.name, email, phone: v.phone, role: v.role, companyId: companyId ?? "", source: `Formulari: ${form.name}`, notes: v.notes };
  const id = await saveRecord(e, null, (n) => values[n], actor);
  return { entity: "people", id, label: v.name, action: "created" };
}

// A seat is taken by a confirmed or attended person (an invitation is not a promise of a seat). The event's capacity is checked under a lock per event, so
// registrations processed at the same moment can never go over it; a full event fails the response at once, with a reason, and staff can retry after raising the capacity.
const TAKES_A_SEAT = ["confirmed", "attended"] as const;
const full = (name: string, capacity: number) => new RoutingError(`L'esdeveniment «${name}» ja és ple (${capacity} places). Amplia l'aforament a l'esdeveniment i torna-ho a provar`);
async function seatsTaken(eventId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(eventAttendance).where(and(eq(eventAttendance.eventId, eventId), inArray(eventAttendance.status, [...TAKES_A_SEAT])));
  return r.n;
}
/** Runs `work` once a seat is guaranteed. Nothing is checked for an invitation or an event without a capacity. */
async function withSeat<T>(ev: { id: string; name: string; capacity: number | null }, status: string, work: () => Promise<T>): Promise<T> {
  if (status === "invited" || !ev.capacity) return work();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"event-seats:" + ev.id}))`); // held until this block ends, so the next registration counts the seat taken here
    if ((await seatsTaken(ev.id)) >= ev.capacity!) throw full(ev.name, ev.capacity!);
    return work(); // saveRecord commits on its own connection before the lock is released
  });
}
/** Before the person is created: a full event refuses a new registration without leaving a stray person behind. A person already registered is not a new seat. */
async function ensureRoom(eventId: string, email: string, status: string): Promise<void> {
  const [ev] = await db.select({ name: events.name, capacity: events.capacity }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev || !ev.capacity || status === "invited") return; // a missing event is reported by ensureAttendance
  const address = email.trim().toLowerCase();
  const [known] = address ? await db.select({ id: eventAttendance.id }).from(eventAttendance).innerJoin(people, eq(people.id, eventAttendance.personId))
    .where(and(eq(eventAttendance.eventId, eventId), sql`lower(btrim(${people.email})) = ${address}`)).limit(1) : [];
  if (!known && (await seatsTaken(eventId)) >= ev.capacity) throw full(ev.name, ev.capacity);
}

/** Signs the person up to the event: once per person and event (a repeat changes nothing, except an invitation becoming a confirmation). */
async function ensureAttendance(eventId: string, person: Routed, companyName: string, status: string, subId: string, form: FormRow, actor: Actor): Promise<Routed> {
  const [ev] = await db.select({ id: events.id, name: events.name, capacity: events.capacity }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) throw new RoutingError("L'esdeveniment triat ja no existeix: tria'n un altre al formulari i torna-ho a provar");
  const e = entity("attendance");
  const [existing] = await db.select().from(eventAttendance).where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.personId, person.id))).limit(1);
  if (existing) {
    if (existing.status === "invited" && status !== "invited") {
      await withSeat(ev, status, () => saveRecord(e, existing.id, (n) => (n === "status" ? status : undefined), actor));
      return { entity: "attendance", id: existing.id, label: ev.name, action: "updated" };
    }
    return { entity: "attendance", id: existing.id, label: ev.name, action: "unchanged" };
  }
  const companyId = await companyIdByName(companyName);
  const values: Record<string, string> = { eventId, personId: person.id, companyId: companyId ?? "", status, notes: `Inscripció pel formulari «${form.name}»` };
  const id = await withSeat(ev, status, async () => {
    const created = await saveRecord(e, null, (n) => values[n], actor);
    await db.update(eventAttendance).set({ externalRef: `form:${subId}` }).where(eq(eventAttendance.id, created));
    return created;
  });
  return { entity: "attendance", id, label: ev.name, action: "created" };
}

type OnceTable = typeof labourCases | typeof trainingCourses | typeof jobSeekers;
/** Creates one record for this response, once: a retry finds it by its external reference instead of creating another. */
async function createOnce(table: OnceTable, entityKey: string, label: string, subId: string, values: Record<string, string>, actor: Actor): Promise<Routed> {
  const ref = `form:${subId}`;
  const [dup] = await db.select({ id: table.id }).from(table).where(eq(table.externalRef, ref)).limit(1);
  if (dup) return { entity: entityKey, id: dup.id, label, action: "unchanged" };
  const id = await saveRecord(entity(entityKey), null, (n) => values[n], actor);
  await db.update(table).set({ externalRef: ref }).where(eq(table.id, id));
  return { entity: entityKey, id, label, action: "created" };
}

/** Creates or updates the records one response asks for. Throws RoutingError / RecordError for problems that retrying will not fix. */
export async function routeSubmission(form: FormRow, sub: Sub): Promise<Routed[]> {
  const routing: Routing | null = normalizeRouting(form.routing);
  const issues = checkRouting(form.fields as Item[], form.routing);
  if (!routing || issues.length) throw new RoutingError(`El formulari no té ben configurat què s'ha de crear: ${issues.join(" · ") || "falta la configuració"}`);
  const target = routingTarget(routing.target)!;
  const actor: Actor = { id: null, email: `Formulari «${form.name}»` };
  const answers = new Map(sub.answers.map((a) => [a.id, a]));
  const text = (name: string) => { const id = routing.map[name]; const a = id ? answers.get(id) : undefined; return a ? answerText(a).trim() : ""; };
  const person = (): PersonValues => ({ name: text("name"), email: text("email"), phone: text("phone"), role: text("role"), company: text("company"), notes: text("notes") });
  const when = day(sub.createdAt);
  const companyId = async () => (await companyIdByName(text("company"))) ?? "";

  switch (target.key) {
    case "person":
      return [await upsertPerson(person(), form, actor)];
    case "attendance": {
      await ensureRoom(fixedValue(routing, "eventId"), text("email"), fixedValue(routing, "status") || "confirmed");
      const p = await upsertPerson(person(), form, actor);
      return [p, await ensureAttendance(fixedValue(routing, "eventId"), p, text("company"), fixedValue(routing, "status") || "confirmed", sub.id, form, actor)];
    }
    case "labour_case":
      return [await createOnce(labourCases, "labour", text("title"), sub.id, { title: text("title"), companyId: await companyId(), summary: text("summary"), status: "open", openedOn: when }, actor)];
    case "training":
      return [await createOnce(trainingCourses, "training", text("name"), sub.id, { name: text("name"), companyId: await companyId(), participants: text("participants"), notes: text("notes") || `Sol·licitud pel formulari «${form.name}»`, status: "planned" }, actor)];
    case "job_seeker": {
      const months = Number(fixedValue(routing, "keepMonths"));
      if (![6, 12, 24, 36].includes(months)) throw new RoutingError("Falta triar quants mesos es conserven les dades de la borsa de treball");
      const consentOn = sub.consentAt ? day(sub.consentAt) : "";
      const keepUntil = addMonths(when, months);
      const email = text("email").toLowerCase();
      const [existing] = email ? await db.select().from(jobSeekers).where(and(sql`lower(btrim(${jobSeekers.email})) = ${email}`, isNull(jobSeekers.archivedAt))).limit(1) : [];
      if (existing) { // a person who applies again: the record is completed and its retention dates only move forward
        const e = entity("job-seekers");
        const patch: Record<string, string | undefined> = {
          phone: existing.phone.trim() ? undefined : text("phone") || undefined, profile: existing.profile.trim() ? undefined : text("profile") || undefined,
          consentOn: consentOn && (!existing.consentOn || consentOn > existing.consentOn) ? consentOn : undefined,
          keepUntil: !existing.keepUntil || keepUntil > existing.keepUntil ? keepUntil : undefined,
        };
        if (Object.values(patch).every((x) => x === undefined)) return [{ entity: "job-seekers", id: existing.id, label: existing.name, action: "unchanged" }];
        await saveRecord(e, existing.id, (n) => patch[n], actor);
        return [{ entity: "job-seekers", id: existing.id, label: existing.name, action: "updated" }];
      }
      return [await createOnce(jobSeekers, "job-seekers", text("name"), sub.id, { name: text("name"), email: text("email"), phone: text("phone"), profile: text("profile"), status: "active", registeredOn: when, consentOn, keepUntil }, actor)];
    }
  }
}

/**
 * Scheduler job: routes pending responses one at a time, each under a row lock (two workers never take the same one). A problem with the form or
 * the data fails the response at once, with the reason; an unexpected error is retried on the next runs, then given up after 3 attempts.
 */
export async function processFormRouting(opts: { limit?: number } = {}): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  const handled: string[] = [];
  for (let i = 0; i < (opts.limit ?? 20); i++) {
    const result = await db.transaction(async (tx) => {
      const [sub] = await tx.select().from(submissions)
        .where(and(eq(submissions.routingStatus, "pending"), handled.length ? notInArray(submissions.id, handled) : undefined))
        .orderBy(submissions.createdAt).limit(1).for("update", { skipLocked: true });
      if (!sub) return null;
      handled.push(sub.id);
      const [form] = await tx.select().from(forms).where(eq(forms.id, sub.formId));
      const attempts = sub.routingAttempts + 1;
      try {
        if (!form || form.destination !== "records") {
          await tx.update(submissions).set({ routingStatus: null, routingError: null }).where(eq(submissions.id, sub.id)); // the form no longer sends responses to the CRM
          return "skipped" as const;
        }
        const routed = await routeSubmission(form, sub);
        await tx.update(submissions).set({ routingStatus: "done", routedAt: new Date(), routingAttempts: attempts, routingError: null, routedRecords: routed }).where(eq(submissions.id, sub.id));
        return "done" as const;
      } catch (e) {
        const permanent = e instanceof RoutingError || e instanceof RecordError;
        if (!permanent) console.error("Routing a response to the CRM failed", e);
        const give = permanent || attempts >= MAX_ATTEMPTS;
        await tx.update(submissions).set({ routingStatus: give ? "failed" : "pending", routingAttempts: attempts, routingError: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).where(eq(submissions.id, sub.id));
        return give ? ("failed" as const) : ("retry" as const);
      }
    });
    if (result === null) break;
    if (result === "done") done++;
    else if (result === "failed") failed++;
  }
  return { done, failed };
}
