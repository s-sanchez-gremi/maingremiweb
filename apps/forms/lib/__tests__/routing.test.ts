import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@apex/db";
import { contacts, forms, leads, submissions } from "@apex/db/schema";
import { checkDefinition, type Item } from "@apex/forms/fieldTypes";
import { checkRouting, fixedValue, normalizeRouting, routingTarget, routingTargets, type Routing } from "@apex/forms/routing";
import { processSubmission, type FormRow } from "@apex/forms/submit";

const L = (ca: string) => ({ ca, es: ca, en: ca });
const item = (type: string, label: string, over: Record<string, unknown> = {}): Item => ({ id: crypto.randomUUID(), type, data: { label: L(label), required: "no", ...over } });
const name = item("text", "Nom", { required: "yes" }), email = item("email", "Correu", { required: "yes" }), phone = item("phone", "Telèfon"), company = item("text", "Empresa");
const people = item("number", "Persones"), notes = item("textarea", "Notes"), cv = item("file", "CV"), heading = item("heading", "Títol"), softEmail = item("email", "Correu opcional");
const ITEMS = [name, email, phone, company, people, notes, cv, heading, softEmail];
const EVENT = "11111111-2222-4333-8444-555555555555";

const valid: Record<string, Routing> = {
  person: { target: "person", map: { name: name.id, email: email.id, phone: phone.id, company: company.id, notes: notes.id }, fixed: {} },
  attendance: { target: "attendance", map: { name: name.id, email: email.id }, fixed: { eventId: EVENT } },
  labour_case: { target: "labour_case", map: { title: name.id, summary: notes.id }, fixed: {} },
  training: { target: "training", map: { name: name.id, participants: people.id }, fixed: {} },
  job_seeker: { target: "job_seeker", map: { name: name.id, email: email.id }, fixed: { keepMonths: "12" } },
};

describe("what a form can create", () => {
  it("declares five targets, each with a name and the values a form can fill", () => {
    expect(routingTargets.map((t) => t.key)).toEqual(["person", "attendance", "labour_case", "training", "job_seeker"]);
    for (const t of routingTargets) { expect(t.label).not.toBe(""); expect(t.description).not.toBe(""); expect(t.map.some((m) => m.required)).toBe(true); }
    expect(routingTarget("nope")).toBeUndefined();
  });
  it("a complete setup of every target passes", () => {
    for (const [key, r] of Object.entries(valid)) expect(checkRouting(ITEMS, r), key).toEqual([]);
  });
});

describe("normalising what a browser sent", () => {
  it("keeps only the target's own keys, trimmed, without empty values", () => {
    const r = normalizeRouting({ target: "attendance", map: { name: ` ${name.id} `, email: email.id, phone: "", hack: "x" }, fixed: { eventId: EVENT, status: "", evil: "1" }, extra: 1 });
    expect(r).toEqual({ target: "attendance", map: { name: name.id, email: email.id }, fixed: { eventId: EVENT } });
  });
  it("refuses what is not a setup", () => {
    for (const bad of [null, undefined, "x", 5, [], { target: "unknown" }, { target: "" }, {}]) expect(normalizeRouting(bad), String(JSON.stringify(bad))).toBeNull();
    expect(checkRouting(ITEMS, null)).toEqual(["Tria què s'ha de crear al CRM amb cada resposta"]);
  });
  it("a missing map or fixed section is just empty", () => {
    expect(normalizeRouting({ target: "person" })).toEqual({ target: "person", map: {}, fixed: {} });
  });
});

describe("checking a setup when the form is saved", () => {
  const issues = (r: Routing) => checkRouting(ITEMS, r).join(" | ");
  it("every value the record needs must be given a field", () => {
    expect(issues({ target: "person", map: {}, fixed: {} })).toContain("«Nom»: tria quin camp");
    expect(issues({ target: "person", map: {}, fixed: {} })).toContain("«Correu»: tria quin camp");
    expect(issues({ target: "labour_case", map: {}, fixed: {} })).toContain("«Assumpte»");
    expect(issues({ target: "training", map: {}, fixed: {} })).toContain("«Curs»");
  });
  it("a field that was removed, a file, or a title cannot be used", () => {
    expect(issues({ ...valid.person, map: { ...valid.person.map, phone: crypto.randomUUID() } })).toContain("ja no existeix");
    expect(issues({ ...valid.person, map: { ...valid.person.map, notes: cv.id } })).toContain("ja no existeix o no es pot fer servir");
    expect(issues({ ...valid.person, map: { ...valid.person.map, notes: heading.id } })).toContain("ja no existeix o no es pot fer servir");
  });
  it("the email that identifies the person must be an email field, and required", () => {
    expect(issues({ ...valid.person, map: { ...valid.person.map, email: company.id } })).toContain("ha de ser un camp de tipus Correu");
    expect(issues({ ...valid.person, map: { ...valid.person.map, email: softEmail.id } })).toContain("ha de ser obligatori");
  });
  it("a number must come from a number field", () => {
    expect(issues({ ...valid.training, map: { ...valid.training.map, participants: notes.id } })).toContain("ha de ser un camp de tipus Número");
  });
  it("a calculated result can fill a text or a number value, but not an email", () => {
    const score = item("calculated", "Puntuació", { op: "sum", terms: [] });
    const withScore = [...ITEMS, score];
    expect(checkRouting(withScore, { ...valid.training, map: { ...valid.training.map, participants: score.id } })).toEqual([]);
    expect(checkRouting(withScore, { ...valid.job_seeker, map: { ...valid.job_seeker.map, profile: score.id } })).toEqual([]);
    expect(checkRouting(withScore, { ...valid.person, map: { ...valid.person.map, email: score.id } }).join(" | ")).toContain("ha de ser un camp de tipus Correu");
  });
  it("one form field cannot fill two values", () => {
    expect(issues({ ...valid.person, map: { ...valid.person.map, phone: name.id } })).toContain("no es pot fer servir per a dues dades");
  });
  it("an event is required and must look like an id; choices must be offered ones", () => {
    expect(issues({ ...valid.attendance, fixed: {} })).toContain("«Esdeveniment»: cal triar-ne un");
    expect(issues({ ...valid.attendance, fixed: { eventId: "not-an-id" } })).toContain("l'esdeveniment triat no és vàlid");
    expect(issues({ ...valid.attendance, fixed: { eventId: EVENT, status: "attended" } })).toContain("el valor triat no és vàlid"); // a registration form cannot mark someone as having attended
    expect(issues({ ...valid.attendance, fixed: { eventId: EVENT, status: "invited" } })).toBe("");
  });
  it("the job board needs a conscious choice of how long the data is kept (no default)", () => {
    expect(issues({ ...valid.job_seeker, fixed: {} })).toContain("«Mesos que es conserven les dades»: cal triar-ne un");
    expect(issues({ ...valid.job_seeker, fixed: { keepMonths: "5" } })).toContain("el valor triat no és vàlid");
    for (const months of ["6", "12", "24", "36"]) expect(issues({ ...valid.job_seeker, fixed: { keepMonths: months } })).toBe("");
  });
  it("settings left alone use their default", () => {
    expect(fixedValue(valid.attendance, "status")).toBe("confirmed");
    expect(fixedValue({ ...valid.attendance, fixed: { eventId: EVENT, status: "invited" } }, "status")).toBe("invited");
    expect(fixedValue(valid.job_seeker, "keepMonths")).toBe("12");
    expect(fixedValue(valid.person, "keepMonths")).toBe("");
  });
  it("the form definition itself needs nothing more for this destination (unlike contact + lead, which needs a mapped email)", () => {
    expect(checkDefinition([name], "records", null)).toEqual([]);
    expect(checkDefinition([name], "crm_lead", null).join()).toContain("camp de correu");
  });
});

describe("through the pipeline", () => {
  const make = async (destination: typeof forms.$inferInsert["destination"], routing: Routing | null = null) => {
    const [f] = await db.insert(forms).values({ name: "Ruta", slug: "ruta-" + crypto.randomUUID().slice(0, 8), destination, routing, active: true, fields: [name, email] as never, notifications: { confirmToSender: true } }).returning();
    return f as FormRow;
  };
  const send = async (form: FormRow, address = `ruta-${crypto.randomUUID().slice(0, 8)}@e2e.test`) => {
    const r = await processSubmission({ form, locale: "ca", consent: false, newsletter: false, files: {}, answers: { [name.id]: "Núria", [email.id]: address }, meta: { sourcePath: "", theme: "", utm: {}, ipHash: "h", challengeId: crypto.randomUUID() } });
    if (!r.ok) throw new Error(JSON.stringify(r));
    return { id: r.id, address };
  };

  it("a response of a records form waits for the CRM, and creates no contact or lead by itself", async () => {
    const form = await make("records", valid.person);
    const s = await send(form);
    const [row] = await db.select().from(submissions).where(eq(submissions.id, s.id));
    expect(row).toMatchObject({ routingStatus: "pending", routingAttempts: 0, routedAt: null, routingError: null, routedRecords: null, contactId: null });
    expect(await db.select().from(contacts).where(eq(contacts.email, s.address))).toHaveLength(0);
    expect(await db.select().from(leads).where(eq(leads.submissionId, s.id))).toHaveLength(0);
  });

  it("other destinations are not routed", async () => {
    for (const destination of ["responses_only", "crm_lead", "project"] as const) {
      const form = await make(destination);
      const s = await send(form);
      expect((await db.select().from(submissions).where(eq(submissions.id, s.id)))[0].routingStatus, destination).toBeNull();
    }
  });
});
