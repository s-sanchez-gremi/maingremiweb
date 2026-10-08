// Records as a form destination, CRM side. A form whose destination is "records" stores each response with routing_status = 'pending' (the Forms app never
// writes CRM tables for this); this file, run by the CRM scheduler, turns every pending response into CRM records THROUGH THE RECORDS ENGINE, so the same
// validation, the same change history and the same de-duplication apply as when a person types the record. What can be created is declared in
// packages/forms/src/routing.ts, shared with the Forms app.
//   - an existing person (found by email) is only COMPLETED (blanks filled), never overwritten: the CRM is the source of truth;
//   - a record is created once per response (its external_ref is "form:<response id>"), so a retry after a crash never duplicates it;
//   - a mapping or data problem fails at once with a message staff can read; an unexpected error is retried up to 3 times.
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, eventAttendance, events, forms, jobSeekers, labourCases, people, submissions, trainingCourses } from "@apex/db/schema";
import { answerText } from "@apex/forms/answer-text";
import { checkRouting, fixedValue, normalizeRouting, routingTarget, type Routing } from "@apex/forms/routing";
import type { Item } from "@apex/forms/fieldTypes";
import { getRecord, saveRecord, type Actor } from "./records/engine";
import { entityByKey } from "./records/registry";
import { RecordError } from "./records/fieldTypes";

type FormRow = typeof forms.$inferSelect;
type Sub = typeof submissions.$inferSelect;
export type Routed = {
  entity: string; id: string; label: string; action: "created" | "updated" | "unchanged";
  own?: boolean; values?: Record<string, string>; // own: this response created the record; values: what the form wrote (see resync)
};

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

/**
 * The respondent edited a response the CRM had already processed (the edit link): bring the records THIS response created up to date. Only what the person
 * changed is applied (the new answer differs from what the form wrote), and only where the CRM still holds exactly what the form wrote: a value staff
 * have edited since is theirs and stays. A record staff deleted is not recreated. Records the response merely completed (an existing person) are never "own".
 */
async function resync(prior: Routed, entityKey: string, next: Record<string, string>, actor: Actor): Promise<Routed> {
  const e = entity(entityKey);
  const current = await getRecord(e, prior.id);
  if (!current) return { ...prior, action: "unchanged" };
  const was = prior.values ?? {};
  const patch: Record<string, string> = {};
  const written = { ...was };
  for (const [name, value] of Object.entries(next)) {
    if (value === (was[name] ?? "")) continue; // the person did not change this
    if (String(current[name] ?? "") !== (was[name] ?? "")) continue; // staff changed it since: theirs wins
    patch[name] = value;
    written[name] = value;
  }
  if (!Object.keys(patch).length) return { ...prior, action: "unchanged" };
  await saveRecord(e, prior.id, (n) => (n in patch ? patch[n] : undefined), actor);
  return { ...prior, action: "updated", values: written };
}

type PersonValues = { name: string; email: string; phone: string; role: string; company: string; notes: string };

/** Creates the person, or completes the one with this email (only blank values are filled in). */
async function upsertPerson(v: PersonValues, form: FormRow, actor: Actor, prior?: Routed): Promise<Routed> {
  const e = entity("people");
  if (prior) return resync(prior, "people", { name: v.name, email: v.email.trim().toLowerCase(), phone: v.phone, role: v.role, notes: v.notes, companyId: (await companyIdByName(v.company)) ?? "" }, actor);
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
  const tracked = { ...values };
  delete tracked.source;
  return { entity: "people", id, label: v.name, action: "created", own: true, values: tracked };
}

/** Signs the person up to the event: once per person and event (a repeat changes nothing, except an invitation becoming a confirmation). */
async function ensureAttendance(eventId: string, person: Routed, companyName: string, status: string, subId: string, form: FormRow, actor: Actor, prior?: Routed): Promise<Routed> {
  if (prior) return resync(prior, "attendance", { companyId: (await companyIdByName(companyName)) ?? "" }, actor);
  const [ev] = await db.select({ id: events.id, name: events.name }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) throw new RoutingError("L'esdeveniment triat ja no existeix: tria'n un altre al formulari i torna-ho a provar");
  const e = entity("attendance");
  const [existing] = await db.select().from(eventAttendance).where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.personId, person.id))).limit(1);
  if (existing) {
    if (existing.status === "invited" && status !== "invited") {
      await saveRecord(e, existing.id, (n) => (n === "status" ? status : undefined), actor);
      return { entity: "attendance", id: existing.id, label: ev.name, action: "updated" };
    }
    return { entity: "attendance", id: existing.id, label: ev.name, action: "unchanged" };
  }
  const companyId = await companyIdByName(companyName);
  const values: Record<string, string> = { eventId, personId: person.id, companyId: companyId ?? "", status, notes: `Inscripció pel formulari «${form.name}»` };
  const id = await saveRecord(e, null, (n) => values[n], actor);
  await db.update(eventAttendance).set({ externalRef: `form:${subId}` }).where(eq(eventAttendance.id, id));
  return { entity: "attendance", id, label: ev.name, action: "created", own: true, values: { companyId: values.companyId } };
}

type OnceTable = typeof labourCases | typeof trainingCourses | typeof jobSeekers;
/** Creates one record for this response, once: a retry finds it by its external reference instead of creating another. */
async function createOnce(table: OnceTable, entityKey: string, label: string, subId: string, values: Record<string, string>, actor: Actor, track: string[], prior?: Routed): Promise<Routed> {
  const tracked = Object.fromEntries(track.map((n) => [n, values[n] ?? ""])); // the values that come from the person's answers (not dates and statuses the CRM sets)
  if (prior) return resync(prior, entityKey, tracked, actor);
  const ref = `form:${subId}`;
  const [dup] = await db.select({ id: table.id }).from(table).where(eq(table.externalRef, ref)).limit(1);
  if (dup) return { entity: entityKey, id: dup.id, label, action: "unchanged", own: true, values: tracked };
  const id = await saveRecord(entity(entityKey), null, (n) => values[n], actor);
  await db.update(table).set({ externalRef: ref }).where(eq(table.id, id));
  return { entity: entityKey, id, label, action: "created", own: true, values: tracked };
}

/** Creates or updates the records one response asks for. Throws RoutingError / RecordError for problems that retrying will not fix. */
export async function routeSubmission(form: FormRow, sub: Sub): Promise<Routed[]> {
  const routing: Routing | null = normalizeRouting(form.routing);
  const issues = checkRouting(form.fields as Item[], form.routing);
  if (!routing || issues.length) throw new RoutingError(`El formulari no té ben configurat què s'ha de crear: ${issues.join(" · ") || "falta la configuració"}`);
  const target = routingTarget(routing.target)!;
  const actor: Actor = { id: null, email: `Formulari «${form.name}»` };
  // A response the CRM already processed that the person has edited since: update what this response created instead of creating it again.
  const prior = new Map((sub.routedAt ? sub.routedRecords ?? [] : []).filter((r) => r.own).map((r) => [r.entity, r]));
  const answers = new Map(sub.answers.map((a) => [a.id, a]));
  const text = (name: string) => { const id = routing.map[name]; const a = id ? answers.get(id) : undefined; return a ? answerText(a).trim() : ""; };
  const person = (): PersonValues => ({ name: text("name"), email: text("email"), phone: text("phone"), role: text("role"), company: text("company"), notes: text("notes") });
  const when = day(sub.createdAt);
  const companyId = async () => (await companyIdByName(text("company"))) ?? "";

  switch (target.key) {
    case "person":
      return [await upsertPerson(person(), form, actor, prior.get("people"))];
    case "attendance": {
      const p = await upsertPerson(person(), form, actor, prior.get("people"));
      return [p, await ensureAttendance(fixedValue(routing, "eventId"), p, text("company"), fixedValue(routing, "status") || "confirmed", sub.id, form, actor, prior.get("attendance"))];
    }
    case "labour_case":
      return [await createOnce(labourCases, "labour", text("title"), sub.id, { title: text("title"), companyId: await companyId(), summary: text("summary"), status: "open", openedOn: when }, actor, ["title", "companyId", "summary"], prior.get("labour"))];
    case "training":
      return [await createOnce(trainingCourses, "training", text("name"), sub.id, { name: text("name"), companyId: await companyId(), participants: text("participants"), notes: text("notes") || `Sol·licitud pel formulari «${form.name}»`, status: "planned" }, actor, ["name", "companyId", "participants", "notes"], prior.get("training"))];
    case "job_seeker": {
      const months = Number(fixedValue(routing, "keepMonths"));
      if (![6, 12, 24, 36].includes(months)) throw new RoutingError("Falta triar quants mesos es conserven les dades de la borsa de treball");
      const consentOn = sub.consentAt ? day(sub.consentAt) : "";
      const keepUntil = addMonths(when, months);
      const email = text("email").toLowerCase();
      const [existing] = email && !prior.has("job-seekers") ? await db.select().from(jobSeekers).where(and(sql`lower(btrim(${jobSeekers.email})) = ${email}`, isNull(jobSeekers.archivedAt))).limit(1) : [];
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
      return [await createOnce(jobSeekers, "job-seekers", text("name"), sub.id, { name: text("name"), email: text("email"), phone: text("phone"), profile: text("profile"), status: "active", registeredOn: when, consentOn, keepUntil }, actor, ["name", "email", "phone", "profile"], prior.get("job-seekers"))];
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
