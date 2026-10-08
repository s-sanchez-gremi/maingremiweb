import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@apex/db";
import { clients, eventAttendance, events, forms, jobSeekers, labourCases, people, recordHistory, submissions, trainingCourses } from "@apex/db/schema";
import type { Item } from "@apex/forms/fieldTypes";
import { routingTargets, type Routing } from "@apex/forms/routing";
import { RoutingError, processFormRouting, routeSubmission } from "../form-routing";
import { ENTITIES } from "../records/registry";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, over: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...over } });
const f = {
  name: item("text", "Nom", { required: "yes" }), email: item("email", "Correu", { required: "yes" }), phone: item("phone", "Telèfon"), role: item("text", "Càrrec"),
  company: item("text", "Empresa"), notes: item("textarea", "Notes"), subject: item("text", "Assumpte"), summary: item("textarea", "Resum"), course: item("text", "Curs"),
  people: item("number", "Persones"), profile: item("textarea", "Perfil"),
};
const FIELDS = Object.values(f);
const map = (pairs: Record<string, Item>) => Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v.id]));

const make = async (routing: Routing | null, over: Partial<typeof forms.$inferInsert> = {}) => {
  const [row] = await db.insert(forms).values({ name: "Form " + crypto.randomUUID().slice(0, 5), slug: "route-" + crypto.randomUUID().slice(0, 8), destination: "records", active: true, fields: FIELDS as never, routing, ...over }).returning();
  return row;
};
const respond = async (form: typeof forms.$inferSelect, values: Partial<Record<keyof typeof f, string>>, over: Partial<typeof submissions.$inferInsert> = {}) => {
  const answers = (Object.keys(values) as (keyof typeof f)[]).map((k) => ({ id: f[k].id, type: f[k].type, label: String(f[k].data.label && (f[k].data.label as { ca: string }).ca), value: f[k].type === "number" ? Number(values[k]) : values[k] }));
  const [s] = await db.insert(submissions).values({ formId: form.id, answers, locale: "ca", routingStatus: null, ...over }).returning(); // not queued unless the test asks: only the scheduler tests need the queue
  return s;
};
const mail = () => `ruta-${crypto.randomUUID().slice(0, 8)}@e2e.test`;
const company = async (name: string, over: Partial<typeof clients.$inferInsert> = {}) => (await db.insert(clients).values({ name, ...over }).returning())[0];
const event = async (name = "Gala " + crypto.randomUUID().slice(0, 4)) => (await db.insert(events).values({ name, startsOn: "2026-11-20" }).returning())[0];
const personByMail = async (email: string) => (await db.select().from(people).where(eq(people.email, email)))[0];

describe("the contract with the Forms app", () => {
  it("every target names a real entity, and every value a form can fill is a real field of it", () => {
    const alias: Record<string, string> = { company: "companyId" }; // a company is given by its name and looked up
    const personFields = new Set(ENTITIES.people.fields.map((x) => x.name));
    for (const t of routingTargets) {
      const e = ENTITIES[t.entity];
      expect(e, `${t.key}: entity ${t.entity}`).toBeDefined();
      const own = new Set(e.fields.map((x) => x.name));
      for (const m of t.map) {
        const name = alias[m.name] ?? m.name;
        const ok = own.has(name) || (t.key === "attendance" && personFields.has(name)); // an attendance form fills the person it signs up
        expect(ok, `${t.key}.${m.name} -> ${name}`).toBe(true);
      }
      for (const x of t.fixed) if (x.name !== "keepMonths") expect(own.has(x.name), `${t.key} fixed ${x.name}`).toBe(true);
    }
    // the status choices offered by the form builder are choices the records accept
    const attendance = ENTITIES.attendance.fields.find((x) => x.name === "status")!.choices!.map(([v]) => v);
    for (const [v] of routingTargets.find((t) => t.key === "attendance")!.fixed.find((x) => x.name === "status")!.choices!) expect(attendance).toContain(v);
  });
});

describe("a person", () => {
  const routing = (): Routing => ({ target: "person", map: map({ name: f.name, email: f.email, phone: f.phone, role: f.role, company: f.company, notes: f.notes }), fixed: {} });

  it("is created with its origin, linked to the company of that name, and the change history names the form (no signed-in user)", async () => {
    const co = await company("Gràfiques Vila " + crypto.randomUUID().slice(0, 4));
    const form = await make(routing()), address = mail();
    const sub = await respond(form, { name: "Núria Soler", email: address.toUpperCase(), phone: "600111222", role: "Gerent", company: co.name.toUpperCase(), notes: "Vol més informació" });
    const r = await routeSubmission(form, sub);
    expect(r).toEqual([{ entity: "people", id: expect.any(String), label: "Núria Soler", action: "created" }]);
    const p = await personByMail(address.toLowerCase());
    expect(p).toMatchObject({ name: "Núria Soler", phone: "600111222", role: "Gerent", companyId: co.id, notes: "Vol més informació", source: `Formulari: ${form.name}` });
    const [h] = await db.select().from(recordHistory).where(and(eq(recordHistory.entity, "people"), eq(recordHistory.recordId, p.id)));
    expect(h).toMatchObject({ action: "create", userId: null, userName: `Formulari «${form.name}»` });
  });

  it("does not guess the company: no match or several matches leave it empty", async () => {
    const dup = "Duplicada " + crypto.randomUUID().slice(0, 4);
    await company(dup); await company(dup);
    const form = await make(routing());
    for (const name of [dup, "Empresa que no existeix " + crypto.randomUUID()]) {
      const address = mail();
      await routeSubmission(form, await respond(form, { name: "Pau", email: address, company: name }));
      expect((await personByMail(address)).companyId).toBeNull();
    }
    const archived = await company("Arxivada " + crypto.randomUUID().slice(0, 4), { archivedAt: new Date() });
    const address = mail();
    await routeSubmission(form, await respond(form, { name: "Pau", email: address, company: archived.name }));
    expect((await personByMail(address)).companyId).toBeNull();
  });

  it("only completes a person that already has this email: what is there is never overwritten", async () => {
    const address = mail(), co = await company("Empresa nova " + crypto.randomUUID().slice(0, 4));
    const [existing] = await db.insert(people).values({ name: "Núria Soler Puig", email: address, phone: "933000000", role: "" }).returning();
    const form = await make(routing());
    const first = await routeSubmission(form, await respond(form, { name: "N. Soler", email: address.toUpperCase(), phone: "600999888", role: "Directora", company: co.name, notes: "Nota nova" }));
    expect(first).toEqual([{ entity: "people", id: existing.id, label: "Núria Soler Puig", action: "updated" }]);
    expect(await personByMail(address)).toMatchObject({ name: "Núria Soler Puig", phone: "933000000", role: "Directora", companyId: co.id, notes: "Nota nova" });
    const again = await routeSubmission(form, await respond(form, { name: "Altre nom", email: address, phone: "611", role: "Altre", company: co.name, notes: "Altra" }));
    expect(again[0].action).toBe("unchanged");
    expect((await db.select().from(people).where(eq(people.email, address))).length).toBe(1);
  });

  it("an archived person with that email is not reused", async () => {
    const address = mail();
    await db.insert(people).values({ name: "Antiga", email: address, archivedAt: new Date() });
    const form = await make(routing());
    const r = await routeSubmission(form, await respond(form, { name: "Nova", email: address }));
    expect(r[0].action).toBe("created");
    expect((await db.select().from(people).where(eq(people.email, address))).length).toBe(2);
  });
});

describe("an event registration", () => {
  const routing = (eventId: string, status?: string): Routing => ({ target: "attendance", map: map({ name: f.name, email: f.email, phone: f.phone, company: f.company }), fixed: { eventId, ...(status ? { status } : {}) } });

  it("creates the person and signs them up once, whatever the number of times they send it", async () => {
    const ev = await event(), co = await company("Empresa gala " + crypto.randomUUID().slice(0, 4)), address = mail();
    const form = await make(routing(ev.id));
    const sub = await respond(form, { name: "Marta Ros", email: address, phone: "600555444", company: co.name });
    const r = await routeSubmission(form, sub);
    expect(r.map((x) => `${x.entity}:${x.action}`)).toEqual(["people:created", "attendance:created"]);
    const p = await personByMail(address);
    const rows = await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, ev.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ personId: p.id, companyId: co.id, status: "confirmed", externalRef: `form:${sub.id}` });
    expect(rows[0].notes).toContain(form.name);
    const second = await routeSubmission(form, await respond(form, { name: "Marta Ros", email: address }));
    expect(second.map((x) => x.action)).toEqual(["unchanged", "unchanged"]);
    expect(await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, ev.id))).toHaveLength(1);
    expect(await db.select().from(people).where(eq(people.email, address))).toHaveLength(1);
  });

  it("an invitation becomes a confirmation, but nothing else is downgraded", async () => {
    const ev = await event(), address = mail();
    const [p] = await db.insert(people).values({ name: "Convidada", email: address }).returning();
    await db.insert(eventAttendance).values({ eventId: ev.id, personId: p.id, status: "invited" });
    const form = await make(routing(ev.id));
    const r = await routeSubmission(form, await respond(form, { name: "Convidada", email: address }));
    expect(r[1].action).toBe("updated");
    expect((await db.select().from(eventAttendance).where(eq(eventAttendance.personId, p.id)))[0].status).toBe("confirmed");
    await db.update(eventAttendance).set({ status: "attended" }).where(eq(eventAttendance.personId, p.id));
    const again = await routeSubmission(form, await respond(form, { name: "Convidada", email: address }));
    expect(again[1].action).toBe("unchanged");
    expect((await db.select().from(eventAttendance).where(eq(eventAttendance.personId, p.id)))[0].status).toBe("attended");
  });

  it("the status staff chose is used", async () => {
    const ev = await event();
    const form = await make(routing(ev.id, "invited"));
    await routeSubmission(form, await respond(form, { name: "Només interès", email: mail() }));
    expect((await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, ev.id)))[0].status).toBe("invited");
  });

  describe("capacity", () => {
    const withCapacity = async (n: number | null) => (await db.insert(events).values({ name: "Aforament " + crypto.randomUUID().slice(0, 4), startsOn: "2026-11-20", capacity: n }).returning())[0];
    const seats = async (eventId: string) => (await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, eventId))).filter((r) => ["confirmed", "attended"].includes(r.status)).length;

    it("stops at the capacity: the next registration fails with a reason and leaves no stray person behind", async () => {
      const ev = await withCapacity(2), form = await make(routing(ev.id));
      await routeSubmission(form, await respond(form, { name: "Una", email: mail() }));
      await routeSubmission(form, await respond(form, { name: "Dues", email: mail() }));
      const late = mail();
      await expect(routeSubmission(form, await respond(form, { name: "Tercera", email: late }))).rejects.toThrow(/ja és ple \(2 places\)/);
      expect(await personByMail(late)).toBeUndefined();
      expect(await seats(ev.id)).toBe(2);
      await db.update(events).set({ capacity: 3 }).where(eq(events.id, ev.id)); // staff raise it and retry
      await routeSubmission(form, await respond(form, { name: "Tercera", email: late }));
      expect(await seats(ev.id)).toBe(3);
    });
    it("a person who is already registered is not refused when the event is full, and nothing changes for them", async () => {
      const ev = await withCapacity(1), form = await make(routing(ev.id)), address = mail();
      await routeSubmission(form, await respond(form, { name: "Primera", email: address }));
      const again = await routeSubmission(form, await respond(form, { name: "Primera", email: address.toUpperCase() }));
      expect(again.map((x) => x.action)).toEqual(["unchanged", "unchanged"]);
      expect(await seats(ev.id)).toBe(1);
    });
    it("an invitation does not take a seat, but confirming one does", async () => {
      const ev = await withCapacity(1), invite = await make(routing(ev.id, "invited")), confirm = await make(routing(ev.id));
      for (let i = 0; i < 3; i++) await routeSubmission(invite, await respond(invite, { name: "Interès " + i, email: mail() })); // no seats used
      expect(await seats(ev.id)).toBe(0);
      const address = mail();
      await routeSubmission(invite, await respond(invite, { name: "Convidada", email: address }));
      await routeSubmission(confirm, await respond(confirm, { name: "Ocupa", email: mail() }));
      await expect(routeSubmission(confirm, await respond(confirm, { name: "Convidada", email: address }))).rejects.toThrow(/ja és ple/); // the upgrade needs a seat
      expect((await db.select().from(eventAttendance).where(eq(eventAttendance.personId, (await personByMail(address)).id)))[0].status).toBe("invited");
    });
    it("without a capacity there is no limit", async () => {
      const ev = await withCapacity(null), form = await make(routing(ev.id));
      for (let i = 0; i < 4; i++) await routeSubmission(form, await respond(form, { name: "Lliure " + i, email: mail() }));
      expect(await seats(ev.id)).toBe(4);
    });
    it("registrations processed at the same moment never go over the capacity", async () => {
      const ev = await withCapacity(2), form = await make(routing(ev.id));
      const subs = await Promise.all(Array.from({ length: 6 }, (_, i) => respond(form, { name: "Alhora " + i, email: mail() })));
      const results = await Promise.allSettled(subs.map((s) => routeSubmission(form, s)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(results.filter((r) => r.status === "rejected").every((r) => /ja és ple/.test(String((r as PromiseRejectedResult).reason?.message)))).toBe(true);
      expect(await seats(ev.id)).toBe(2);
    });
    it("through the scheduler a full event fails the response at once with the reason, and a retry works after raising it", async () => {
      const ev = await withCapacity(1), form = await make(routing(ev.id));
      const a = await respond(form, { name: "Dins", email: mail() }, { routingStatus: "pending" }), b = await respond(form, { name: "Fora", email: mail() }, { routingStatus: "pending" });
      await processFormRouting();
      const [ra] = await db.select().from(submissions).where(eq(submissions.id, a.id)), [rb] = await db.select().from(submissions).where(eq(submissions.id, b.id));
      expect([ra.routingStatus, rb.routingStatus]).toEqual(["done", "failed"]);
      expect(rb.routingError).toContain("ja és ple");
    });
  });

  it("an event that no longer exists is a clear problem for staff, not a silent loss", async () => {
    const ev = await event();
    const form = await make(routing(ev.id));
    await db.delete(events).where(eq(events.id, ev.id));
    await expect(routeSubmission(form, await respond(form, { name: "Tard", email: mail() }))).rejects.toThrow(/esdeveniment triat ja no existeix/);
  });
});

describe("cases, training and the job board", () => {
  it("a labour case is created once per response, open, dated, linked to the company", async () => {
    const co = await company("Consulta laboral " + crypto.randomUUID().slice(0, 4));
    const form = await make({ target: "labour_case", map: map({ title: f.subject, company: f.company, summary: f.summary }), fixed: {} });
    const sub = await respond(form, { subject: "Acomiadament", company: co.name, summary: "Detalls de la consulta" }, { createdAt: new Date("2026-10-07T10:00:00Z") });
    const r = await routeSubmission(form, sub);
    expect(r[0]).toMatchObject({ entity: "labour", label: "Acomiadament", action: "created" });
    const [c] = await db.select().from(labourCases).where(eq(labourCases.externalRef, `form:${sub.id}`));
    expect(c).toMatchObject({ title: "Acomiadament", companyId: co.id, summary: "Detalls de la consulta", status: "open", openedOn: "2026-10-07" });
    expect((await routeSubmission(form, sub))[0].action).toBe("unchanged"); // a retry never duplicates
    expect(await db.select().from(labourCases).where(eq(labourCases.externalRef, `form:${sub.id}`))).toHaveLength(1);
  });

  it("a training request is created planned, with the number of participants", async () => {
    const form = await make({ target: "training", map: map({ name: f.course, participants: f.people, notes: f.notes }), fixed: {} });
    const sub = await respond(form, { course: "Excel avançat", people: "12" });
    await routeSubmission(form, sub);
    const [c] = await db.select().from(trainingCourses).where(eq(trainingCourses.externalRef, `form:${sub.id}`));
    expect(c).toMatchObject({ name: "Excel avançat", participants: 12, status: "planned" });
    expect(c.notes).toContain(form.name); // says where it came from when nothing else was written
  });

  it("a value the record does not accept is reported with the field, never half-saved", async () => {
    const form = await make({ target: "training", map: map({ name: f.course, participants: f.people }), fixed: {} });
    const sub = await respond(form, { course: "Curs" });
    const answers = [...sub.answers, { id: f.people.id, type: "number", label: "Persones", value: "molts" }];
    await expect(routeSubmission(form, { ...sub, answers })).rejects.toThrow(/nombre enter/);
    expect(await db.select().from(trainingCourses).where(eq(trainingCourses.externalRef, `form:${sub.id}`))).toHaveLength(0);
  });

  it("a job seeker gets the consent date, the registration date and a retention date that staff chose", async () => {
    const form = await make({ target: "job_seeker", map: map({ name: f.name, email: f.email, phone: f.phone, profile: f.profile }), fixed: { keepMonths: "12" } });
    const address = mail();
    const sub = await respond(form, { name: "Laia Roca", email: address, profile: "Dissenyadora" }, { createdAt: new Date("2026-10-07T10:00:00Z"), consentAt: new Date("2026-10-07T10:00:00Z") });
    await routeSubmission(form, sub);
    const [j] = await db.select().from(jobSeekers).where(eq(jobSeekers.email, address));
    expect(j).toMatchObject({ name: "Laia Roca", profile: "Dissenyadora", status: "active", registeredOn: "2026-10-07", consentOn: "2026-10-07", keepUntil: "2027-10-07" });
  });

  it("without a consent there is no consent date, and without the retention choice nothing is created", async () => {
    const noConsent = await make({ target: "job_seeker", map: map({ name: f.name, email: f.email }), fixed: { keepMonths: "6" } });
    const address = mail();
    await routeSubmission(noConsent, await respond(noConsent, { name: "Sense consentiment", email: address }, { createdAt: new Date("2026-10-07T10:00:00Z") }));
    expect((await db.select().from(jobSeekers).where(eq(jobSeekers.email, address)))[0]).toMatchObject({ consentOn: null, keepUntil: "2027-04-07" });
    const unset = await make({ target: "job_seeker", map: map({ name: f.name, email: f.email }), fixed: {} });
    const other = mail();
    await expect(routeSubmission(unset, await respond(unset, { name: "X", email: other }))).rejects.toBeInstanceOf(RoutingError);
    expect(await db.select().from(jobSeekers).where(eq(jobSeekers.email, other))).toHaveLength(0);
  });

  it("a candidate who applies again is completed, and the retention dates only move forward", async () => {
    const form = await make({ target: "job_seeker", map: map({ name: f.name, email: f.email, phone: f.phone, profile: f.profile }), fixed: { keepMonths: "12" } });
    const address = mail();
    const first = await respond(form, { name: "Ona", email: address }, { createdAt: new Date("2026-01-10T10:00:00Z"), consentAt: new Date("2026-01-10T10:00:00Z") });
    await routeSubmission(form, first);
    const again = await respond(form, { name: "Ona", email: address, phone: "600123123", profile: "Nou perfil" }, { createdAt: new Date("2026-10-07T10:00:00Z"), consentAt: new Date("2026-10-07T10:00:00Z") });
    expect((await routeSubmission(form, again))[0].action).toBe("updated");
    const rows = await db.select().from(jobSeekers).where(eq(jobSeekers.email, address));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: "600123123", profile: "Nou perfil", consentOn: "2026-10-07", keepUntil: "2027-10-07" });
    const earlier = await respond(form, { name: "Ona", email: address }, { createdAt: new Date("2026-02-01T10:00:00Z"), consentAt: new Date("2026-02-01T10:00:00Z") });
    expect((await routeSubmission(form, earlier))[0].action).toBe("unchanged"); // an older response never shortens or moves them back
  });
});

describe("the scheduler job", () => {
  const queued = (form: typeof forms.$inferSelect, values: Parameters<typeof respond>[1], over: Partial<typeof submissions.$inferInsert> = {}) => respond(form, values, { routingStatus: "pending", ...over });
  const personRouting = (): Routing => ({ target: "person", map: map({ name: f.name, email: f.email }), fixed: {} });

  it("routes pending responses, records what it did, and leaves the others alone", async () => {
    const form = await make(personRouting()), address = mail();
    const pending = await queued(form, { name: "Pendent", email: address });
    const done = await respond(form, { name: "Ja fet", email: mail() }, { routingStatus: "done" });
    const plain = await respond(form, { name: "Sense ruta", email: mail() }, { routingStatus: null });
    const r = await processFormRouting();
    expect(r.done).toBeGreaterThanOrEqual(1);
    const [p] = await db.select().from(submissions).where(eq(submissions.id, pending.id));
    expect(p).toMatchObject({ routingStatus: "done", routingAttempts: 1, routingError: null });
    expect(p.routedAt).not.toBeNull();
    expect(p.routedRecords).toEqual([{ entity: "people", id: expect.any(String), label: "Pendent", action: "created" }]);
    expect((await db.select().from(submissions).where(eq(submissions.id, done.id)))[0].routedRecords).toBeNull();
    expect((await db.select().from(submissions).where(eq(submissions.id, plain.id)))[0].routingStatus).toBeNull();
  });

  it("a problem with the form or the data fails at once with a readable reason, and staff can reset it to try again", async () => {
    const ev = await event();
    const form = await make({ target: "attendance", map: map({ name: f.name, email: f.email }), fixed: { eventId: ev.id } });
    const sub = await queued(form, { name: "Sense lloc", email: mail() });
    await db.delete(events).where(eq(events.id, ev.id));
    await processFormRouting();
    const [s] = await db.select().from(submissions).where(eq(submissions.id, sub.id));
    expect(s).toMatchObject({ routingStatus: "failed", routingAttempts: 1 });
    expect(s.routingError).toContain("esdeveniment triat ja no existeix");
    // a bad mapping is caught before anything is created
    const broken = await make({ target: "person", map: { name: f.name.id }, fixed: {} }); // no email mapped
    const b = await queued(broken, { name: "Sense correu mapat" });
    await processFormRouting();
    const [after] = await db.select().from(submissions).where(eq(submissions.id, b.id));
    expect(after.routingStatus).toBe("failed");
    expect(after.routingError).toContain("no té ben configurat");
    expect(after.routingError).toContain("Correu");
    // the Forms app puts a failed response back to pending; the CRM then routes it
    const fixedEvent = await event();
    await db.update(forms).set({ routing: { target: "attendance", map: map({ name: f.name, email: f.email }), fixed: { eventId: fixedEvent.id } } }).where(eq(forms.id, form.id));
    await db.update(submissions).set({ routingStatus: "pending", routingAttempts: 0, routingError: null }).where(eq(submissions.id, sub.id));
    await processFormRouting();
    expect((await db.select().from(submissions).where(eq(submissions.id, sub.id)))[0]).toMatchObject({ routingStatus: "done", routingError: null });
    expect(await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, fixedEvent.id))).toHaveLength(1);
  });

  it("a form that no longer sends responses to the CRM is not acted on", async () => {
    const form = await make(personRouting(), { destination: "responses_only" });
    const sub = await queued(form, { name: "Canviada", email: mail() });
    await processFormRouting();
    expect((await db.select().from(submissions).where(eq(submissions.id, sub.id)))[0]).toMatchObject({ routingStatus: null });
    expect(await db.select().from(people).where(eq(people.name, "Canviada"))).toHaveLength(0);
  });

  it("two workers at once create each record exactly once", async () => {
    const form = await make(personRouting()), address = mail();
    await queued(form, { name: "Concurrent", email: address });
    await Promise.all([processFormRouting(), processFormRouting(), processFormRouting()]);
    expect(await db.select().from(people).where(eq(people.email, address))).toHaveLength(1);
  });

  it("a response that keeps failing does not make one run loop", async () => {
    const form = await make({ target: "person", map: {}, fixed: {} });
    for (let i = 0; i < 3; i++) await queued(form, { name: "Mal configurat " + i });
    const r = await processFormRouting({ limit: 50 });
    expect(r.failed).toBeGreaterThanOrEqual(3);
  });
});
