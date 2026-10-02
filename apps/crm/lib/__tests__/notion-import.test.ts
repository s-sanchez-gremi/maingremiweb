import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { clients, eventAttendance, events, feeTiers, jobSeekers, members, people, sponsors, suppliers, trainingCourses, visits, users } from "@apex/db/schema";
import { mergeCompanies } from "../notion-import/companies";
import { queryDatabase, toRow, flattenProp, mask, type Row } from "../notion-import/notion";
import { runImport } from "../notion-import";

// ---- Notion API shaped fixtures ----
const t = (s: string) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });
const title = (s: string) => ({ type: "title", title: [{ plain_text: s }] });
const sel = (s: string | null) => ({ type: "select", select: s ? { name: s } : null });
const num = (n: number | null) => ({ type: "number", number: n });
const email = (s: string) => ({ type: "email", email: s || null });
const phone = (s: string) => ({ type: "phone_number", phone_number: s || null });
const rel = (...ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) });
const multi = (...n: string[]) => ({ type: "multi_select", multi_select: n.map((name) => ({ name })) });
const status = (s: string) => ({ type: "status", status: { name: s } });
const date = (s: string | null) => ({ type: "date", date: s ? { start: s } : null });
let n = 0;
const page = (properties: Record<string, unknown>, created = `2026-03-0${(n++ % 9) + 1}T10:00:00.000Z`) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, created_time: created, properties });
const rows = (...p: ReturnType<typeof page>[]): Row[] => p.map((x) => toRow(x as Parameters<typeof toRow>[0]));
const company = (o: { name: string; cif?: string; agremiat?: string; cuota?: string; amount?: number; att?: string; matriu?: string[]; mail?: string; tel?: string }) => page({
  Empresa: title(o.name), CIF: t(o.cif ?? ""), Agremiat: sel(o.agremiat ?? "agremiat"), Cuota: status(o.cuota ?? "Corrent pagament"), Import: num(o.amount ?? null), Att: t(o.att ?? ""),
  "Matriu agremiat": rel(...(o.matriu ?? [])), "Correu General": email(o.mail ?? ""), "Teléfono": phone(o.tel ?? ""), Municipi: t("Terrassa"), provincia: sel("Barcelona"), revista: sel("Si"), "Any fundació": num(1998),
});
const run = (sources: Parameters<typeof runImport>[0]["sources"], data: Record<string, Row[]>, extra: Partial<Parameters<typeof runImport>[0]> = {}) =>
  runImport({ db, read: async (id) => data[id] ?? [], sources, dryRun: false, ...extra });

beforeEach(async () => {
  for (const x of [eventAttendance, events, visits, sponsors, suppliers, trainingCourses, jobSeekers, people, members, feeTiers, clients, users]) await db.delete(x);
});

describe("reading Notion", () => {
  it("flattens property values", () => {
    expect(flattenProp(title("  Acme ") as never)).toBe("Acme");
    expect(flattenProp(multi("a", "b") as never)).toEqual(["a", "b"]);
    expect(flattenProp(date("2026-05-02") as never)).toBe("2026-05-02");
    expect(flattenProp(rel("x") as never)).toEqual(["x"]);
    expect(flattenProp({ type: "rollup", rollup: {} } as never)).toBeNull();
  });
  it("follows the pagination cursor and explains a 404", async () => {
    const calls: string[] = [];
    const fake = (async (_u: string, init: { body: string }) => {
      const body = JSON.parse(init.body); calls.push(body.start_cursor ?? "first");
      return new Response(JSON.stringify({ results: [page({ Nom: title(body.start_cursor ? "B" : "A") })], has_more: !body.start_cursor, next_cursor: "c2" }), { status: 200 });
    }) as unknown as typeof fetch;
    const got: string[] = []; for await (const r of queryDatabase("tok", "db1", fake)) got.push(r.title);
    expect(got).toEqual(["A", "B"]); expect(calls).toEqual(["first", "c2"]);
    await expect((async () => { for await (const r of queryDatabase("tok", "db1", (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch)) void r; })()).rejects.toThrow(/shared/);
  });
  it("masks names for the report", () => expect(mask("Anna Puig")).toBe("A••• P•••"));
});

describe("companies", () => {
  it("merges pages of the same company by CIF (spaces/case ignored), then by name, keeping the strongest status", () => {
    const m = mergeCompanies(rows(company({ name: "Vila SL", cif: "B 123", agremiat: "NO AGREMIAT" }), company({ name: "VILA, S.L.", cif: "b123", agremiat: "agremiat", tel: "937" }), company({ name: "Altres", cif: "" }), company({ name: "altres" })));
    expect(m).toHaveLength(2);
    const vila = m.find((c) => c.taxId)!;
    expect([vila.ids.length, vila.memberStatus, vila.phone]).toEqual([2, "member", "937"]);
  });
  it("imports companies with all fields, the contact as a person, parent link, ERP member and fee tier", async () => {
    const parent = company({ name: "Grup Gràfic", cif: "A1", amount: 600 });
    const child = company({ name: "Filial SL", cif: "B2", amount: 492, cuota: "Impagament", att: "Anna Puig", matriu: [parent.id], mail: "info@filial.example" });
    const old = company({ name: "Antiga SA", cif: "C3", agremiat: "antic agremiat" });
    const prospect = company({ name: "Potencial", cif: "D4", agremiat: "NO AGREMIAT" });
    const { reports } = await run({ companies: ["db"] }, { db: rows(parent, child, old, prospect) }, { minTier: 1 });
    expect(reports[0]).toMatchObject({ created: 4, updated: 0 });
    const f = (await db.select().from(clients)).find((x) => x.name === "Filial SL")!;
    expect(f).toMatchObject({ taxId: "B2", memberStatus: "member", email: "info@filial.example", city: "Terrassa", province: "Barcelona", getsMagazine: true, foundedYear: 1998 });
    expect(f.parentCompanyId).toBe((await db.select().from(clients)).find((x) => x.name === "Grup Gràfic")!.id);
    expect((await db.select().from(people))[0]).toMatchObject({ name: "Anna Puig", role: "Contacte", companyId: f.id });
    const ms = await db.select().from(members);
    expect(ms.map((x) => x.name).sort()).toEqual(["Antiga SA", "Filial SL", "Grup Gràfic"]);
    expect(ms.find((x) => x.name === "Filial SL")!.notes).toBe("Quota (Notion): Impagament");
    expect(ms.find((x) => x.name === "Antiga SA")!.status).toBe("left");
    expect((await db.select().from(feeTiers)).map((x) => [x.name, x.annualCents]).sort()).toEqual([["Quota 492 €", 49200], ["Quota 600 €", 60000]]);
  });
  it("is repeatable: a second run changes nothing, and only fills blanks of records people edited", async () => {
    const data = { db: rows(company({ name: "Vila SL", cif: "B1", amount: 100, att: "Joan" })) };
    await run({ companies: ["db"] }, data);
    await db.update(clients).set({ email: "editat@vila.example", city: "" }); // a person edited the record after the first import
    const second = await run({ companies: ["db"] }, { db: rows(company({ name: "Vila SL", cif: "B 1", mail: "notion@vila.example", amount: 100, att: "Joan" })) });
    expect(second.reports[0].created).toBe(0);
    const after = (await db.select().from(clients))[0];
    expect(after.email).toBe("editat@vila.example"); // not overwritten
    expect(after.city).toBe("Terrassa"); // blank filled
    expect(await db.select().from(clients)).toHaveLength(1);
    expect(await db.select().from(people)).toHaveLength(1);
    expect(await db.select().from(members)).toHaveLength(1);
    await run({ companies: ["db"] }, { db: rows(company({ name: "Vila SL", cif: "B1", mail: "nou@vila.example" })) }, { overwrite: true });
    expect((await db.select().from(clients))[0].email).toBe("nou@vila.example");
  });
  it("matches an existing company by CIF instead of creating a duplicate", async () => {
    await db.insert(clients).values({ name: "Vila (antic client)", taxId: "b 1" });
    const r = await run({ companies: ["db"] }, { db: rows(company({ name: "Vila SL", cif: "B1" })) });
    expect(r.reports[0]).toMatchObject({ created: 0, updated: 1 });
    expect(await db.select().from(clients)).toHaveLength(1);
  });
  it("a dry run reports the same numbers and writes nothing", async () => {
    const r = await run({ companies: ["db"] }, { db: rows(company({ name: "A", cif: "A1", att: "X Y" }), company({ name: "B", cif: "B1" })) }, { dryRun: true });
    expect(r.reports[0]).toMatchObject({ created: 2 });
    expect(r.text).toContain("DRY RUN");
    expect(r.text).not.toMatch(/\bA1\b|X Y/); // no personal data in the report
    for (const x of [clients, people, members, feeTiers]) expect(await db.select().from(x)).toHaveLength(0);
  });
  it("--no-erp skips members and tiers", async () => {
    await run({ companies: ["db"] }, { db: rows(company({ name: "A", cif: "A1", amount: 50 })) }, { erp: false });
    expect(await db.select().from(members)).toHaveLength(0);
  });
  it("only shared fee amounts become tiers; one-off amounts stay in the member's notes", async () => {
    const shared = [1, 2, 3, 4, 5].map((i) => company({ name: `Soci ${i}`, cif: `S${i}`, amount: 356 }));
    const odd = company({ name: "Especial SL", cif: "E1", amount: 123.45 });
    const r = await run({ companies: ["db"] }, { db: rows(...shared, odd) });
    expect((await db.select().from(feeTiers)).map((x) => x.name)).toEqual(["Quota 356 €"]);
    expect(r.reports[0].extra["custom fee amounts kept in notes"]).toBe(1);
    const m = (await db.select().from(members)).find((x) => x.name === "Especial SL")!;
    expect([m.tierId, m.notes]).toEqual([null, "Quota anual (Notion): 123,45 €"]);
  });
});

describe("gala, visits and the other areas", () => {
  it("gala: one event, people and attendance by company, DNI never stored, repeats skipped", async () => {
    const co = company({ name: "Vila SL", cif: "B1" });
    const att = (name: string, extra: Record<string, unknown> = {}) => page({ Nom: title(name), Email: email(extra.mail as string ?? ""), DNI: t("12345678Z"), Empresa: t("Vila SL"), "📜 Empreses": rel(), Categoria: multi("jurat"), SEIENTS: multi("vip"), Fila: t("3"), Observacions: t("") });
    const a = att("Anna Puig", { mail: "anna@x.example" }); const b = att("Anna Puig", { mail: "anna@x.example" }); const c = att("Joan Soler");
    const r = await run({ companies: ["c"], gala: ["g"] }, { c: rows(co), g: rows(a, b, c) });
    const gala = r.reports.find((x) => x.source.startsWith("Gala"))!;
    expect(gala).toMatchObject({ created: 2, skipped: 1 });
    expect(gala.extra["DNI values left out on purpose"]).toBe(3);
    const ev = await db.select().from(events); expect(ev).toHaveLength(1); expect(ev[0]).toMatchObject({ kind: "gala" });
    const ps = await db.select().from(people); expect(ps.map((x) => x.name).sort()).toEqual(["Anna Puig", "Joan Soler"]);
    expect(JSON.stringify(ps) + JSON.stringify(await db.select().from(eventAttendance))).not.toContain("12345678Z");
    const at = await db.select().from(eventAttendance); expect(at[0].notes).toBe("Categoria: jurat · Seients: vip · Fila: 3");
    expect(at.every((x) => x.companyId)).toBe(true); // company found from the typed name
    await run({ gala: ["g"] }, { g: rows(a, b, c) });
    expect(await db.select().from(eventAttendance)).toHaveLength(2);
  });
  it("people sharing one company mailbox stay separate people; typed company names match despite legal forms and short names", async () => {
    const co = company({ name: "Gràfiques Vila, S.L.", cif: "B1" });
    const att = (name: string, empresa: string) => page({ Nom: title(name), Email: email("info@vila.example"), Empresa: t(empresa), "📜 Empreses": rel(), Categoria: multi(), SEIENTS: multi() });
    await run({ companies: ["c"], gala: ["g"] }, { c: rows(co), g: rows(att("Anna Puig", "GRAFIQUES VILA SL"), att("Joan Soler", "Grafiques Vila"), att("Marta Roca", "Altra empresa")) });
    expect((await db.select().from(people)).map((x) => x.name).sort()).toEqual(["Anna Puig", "Joan Soler", "Marta Roca"]);
    const at = await db.select().from(eventAttendance);
    expect(at.filter((x) => x.companyId)).toHaveLength(2);
  });
  it("visits: maps status, kind, date, company and keeps the responsible person in the summary", async () => {
    const co = company({ name: "Vila SL", cif: "B1" });
    const v = page({ "Nombre de la tarea": title("Visita de benvinguda"), Data: date("2026-02-10"), Empresa: rel(co.id), Estado: status("Completada"), "Tipo de tarea": multi("Agremiar"), Prioridad: sel("Alta"), "Descripción": t("Molt interessats"), Responsable: { type: "people", people: [{ name: "Sam" }] } });
    await run({ companies: ["c"], visits: ["v"] }, { c: rows(co), v: rows(v) });
    const [x] = await db.select().from(visits);
    expect(x).toMatchObject({ subject: "Visita de benvinguda", visitedOn: "2026-02-10", status: "done", kind: "new_member" });
    expect(x.companyId).toBeTruthy();
    expect(x.summary).toContain("Molt interessats"); expect(x.summary).toContain("Responsable (Notion): Sam");
  });
  it("job seekers: imported with contact data but consent and retention left empty and flagged", async () => {
    const j = page({ Nombre: title("Maria Test"), "Email addresses": email("maria@x.example"), "Número de telèfon": phone("600111222"), Càrrec: t("Dissenyadora") });
    const r = await run({ jobseekers: ["j"] }, { j: rows(j) });
    expect(r.reports[0].created).toBe(1);
    const [x] = await db.select().from(jobSeekers);
    expect(x).toMatchObject({ name: "Maria Test", email: "maria@x.example", phone: "600111222", consentOn: null, keepUntil: null });
    expect(x.notes).toContain("consentiment"); expect(x.notes).toContain("Dissenyadora");
    await run({ jobseekers: ["j"] }, { j: rows(j) });
    expect(await db.select().from(jobSeekers)).toHaveLength(1);
  });
});

describe("messy real-world values", () => {
  it("leaves impossible founding years and employee counts empty instead of failing, and says so", async () => {
    const bad = page({ Empresa: title("Rara SL"), CIF: t("B5"), Agremiat: sel("agremiat"), "Any fundació": num(1042026), treballadors: num(-4) });
    const r = await run({ companies: ["db"] }, { db: rows(bad) }, { erp: false });
    expect(r.reports[0].created).toBe(1);
    expect(r.reports[0].extra["invalid founding years left empty"]).toBe(1);
    expect(r.reports[0].extra["invalid employee counts left empty"]).toBe(1);
    expect((await db.select().from(clients))[0]).toMatchObject({ foundedYear: null, employees: null });
  });
});

describe("former members database", () => {
  it("every row becomes a former member (title column 'Nombre'), also when its own status says agremiat; current members are never downgraded", async () => {
    const current = company({ name: "Encara Soci SL", cif: "B1", agremiat: "agremiat" });
    const gone = page({ Nombre: title("Antiga Soci SA"), CIF: t("B2"), Agremiat: sel("agremiat"), Cuota: status("Corrent pagament"), Import: num(null), "Teléfono": phone("") });
    const both = page({ Nombre: title("Encara Soci SL"), CIF: t("B1"), Agremiat: sel("agremiat"), Cuota: status("Impagament"), Import: num(null), "Teléfono": phone("") });
    const r = await run({ companies: ["c"], former: ["f"] }, { c: rows(current), f: rows(gone, both) });
    const f = r.reports.find((x) => x.source.startsWith("Exagremiats"))!;
    expect(f.extra["also a CURRENT member elsewhere (status left unchanged, check by hand)"]).toBe(1);
    const all = await db.select().from(clients);
    expect(all.find((x) => x.name === "Antiga Soci SA")!.memberStatus).toBe("former");
    expect(all.find((x) => x.name === "Encara Soci SL")!.memberStatus).toBe("member");
    expect((await db.select().from(members)).find((x) => x.name === "Antiga Soci SA")!.status).toBe("left");
  });
});

describe("external (non-member) companies", () => {
  it("are imported as companies without ERP records, merged with existing ones by name, never overwriting", async () => {
    const existing = company({ name: "Gràfiques Vila, S.L.", cif: "" });
    const ext = (name: string, extra: Record<string, unknown> = {}) => page({ Nombre: title(name), CIF: t(""), Agremiat: sel(null), Cuota: status("Sense dades"), web: { type: "url", url: "https://vila.example" }, ...extra });
    const old = ext("Antic Extern SA", { Agremiat: sel("antic agremiat"), Import: num(300) });
    const r = await run({ companies: ["c"], external: ["e"] }, { c: rows(existing), e: rows(ext("GRAFIQUES VILA SL"), ext("Altra Empresa"), old) });
    const e = r.reports.find((x) => x.source.startsWith("Externes"))!;
    expect(e).toMatchObject({ created: 2, updated: 1 });
    const all = await db.select().from(clients);
    expect(all).toHaveLength(3);
    expect(all.find((x) => x.name === "Gràfiques Vila, S.L.")!.website).toBe("https://vila.example"); // blank filled
    expect(all.find((x) => x.name === "Altra Empresa")!.memberStatus).toBe("prospect");
    expect(await db.select().from(members)).toHaveLength(1); // only the real member from the main list
  });
});

describe("sponsors (Patrocinadors)", () => {
  it("keeps the whole prospect pipeline readable, links the company by name, takes a plain budget as the amount", async () => {
    const co = company({ name: "Gràfiques Vila, S.L.", cif: "B1" });
    const sp = (name: string, extra: Record<string, unknown> = {}) => page({ Nombre: title(name), agremiat: multi("si"), esdeveniments: multi("Gala Gràfica", "Congrés"), "últim contacte": date("2026-02-10"), "persona de contacte": email("c@vila.example"), contactats: { type: "checkbox", checkbox: true }, proposta: t("Pack or"), pressupost: t("5.000 €"), seguiment: t("Trucar al març"), "històric": t(""), "descripció activitat": t("Impremta"), "desglossament press.": t(""), "📜 Empreses": rel(), ...extra });
    const s = rows(sp("Grafiques Vila SL"), sp("Altra, SA", { pressupost: t("a negociar") }));
    const r = await run({ companies: ["c"], sponsors: ["s"] }, { c: rows(co), s });
    expect(r.reports.find((x) => x.source === "Patrocinadors")).toMatchObject({ created: 2 });
    const all = await db.select().from(sponsors);
    const vila = all.find((x) => x.name === "Grafiques Vila SL")!;
    expect(vila).toMatchObject({ kind: "sponsor", status: "prospect", amountCents: 500000 });
    expect(vila.companyId).toBeTruthy();
    expect(vila.notes).toContain("Esdeveniments: Gala Gràfica, Congrés");
    expect(vila.notes).toContain("Seguiment: Trucar al març");
    const altra = all.find((x) => x.name === "Altra, SA")!;
    expect([altra.amountCents, altra.companyId]).toEqual([null, null]);
    expect(altra.notes).toContain("Pressupost: a negociar");
    await run({ sponsors: ["s"] }, { s });
    expect(await db.select().from(sponsors)).toHaveLength(2); // repeatable
  });
});

describe("Laboral contact lists and Bonificada courses", () => {
  it("each list becomes an event; both row shapes work; people keep their own e-mail even on a shared company mailbox; repeatable", async () => {
    const co = company({ name: "Cartonajes Ribas, S.A.", cif: "A1" });
    const a = page({ Nombre: title("CARTONAJES RIBAS SA"), Persona: t("Pere Ribas"), "Persona > Email addresses": email("info@ribas.example"), "Persona > Phone numbers": num(600111222), event: sel("laboral") });
    const a2 = page({ Nombre: title("CARTONAJES RIBAS SA"), Persona: t("Laia Ribas"), "Persona > Email addresses": email("info@ribas.example"), "Persona > Phone numbers": num(null), event: sel("laboral") });
    const b = page({ Nombre: title(""), Empresa: t("Empresa Desconeguda SL"), "Nom i cognom contacte": t("Marc Soler"), email: email("marc@x.example"), telefon: phone("933111222") });
    const empty = page({ Nombre: title(""), Empresa: t(""), "Nom i cognom contacte": t(""), email: email(""), telefon: phone("") });
    const A = rows(a, a2), B = rows(b, empty);
    const data = { c: rows(co), A, B };
    const r = await run({ companies: ["c"], labour: ["A:Laboral 04/03", "B:Laboral 28/9"] }, data);
    expect((await db.select().from(events)).map((x) => x.name).sort()).toEqual(["Laboral 04/03", "Laboral 28/9"]);
    expect((await db.select().from(people)).map((x) => x.name).sort()).toEqual(["Laia Ribas", "Marc Soler", "Pere Ribas"]);
    const marc = (await db.select().from(eventAttendance)).find((x) => x.notes.includes("Empresa Desconeguda"));
    expect(marc).toBeTruthy(); // unmatched company name is kept
    expect(r.reports.find((x) => x.source.includes("28/9"))!.extra["skipped: nothing identifies the row (no person, company or e-mail we know)"]).toBe(1);
    expect((await db.select().from(eventAttendance)).filter((x) => x.companyId)).toHaveLength(2);
    await run({ labour: ["A:Laboral 04/03", "B:Laboral 28/9"] }, data);
    expect(await db.select().from(eventAttendance)).toHaveLength(3);
    expect(await db.select().from(events)).toHaveLength(2);
  });
  it("Bonificada: status, hours, end date, company from the member or external relation (also from a previous run), details in notes", async () => {
    const co = company({ name: "Vila SL", cif: "B1" });
    const course = (name: string, o: Record<string, unknown> = {}) => page({ Nombre: title(name), "Situació": status("En curs"), Agremiats: rel(), Externes: rel(), Preu: num(1250.5), Formadors: rel("f1", "f2"), Pressupost: { type: "files", files: [{ name: "pressupost.pdf" }] }, Responsable: { type: "people", people: [{ name: "Sam" }] }, Hores: num(40), "Data final": date("2026-06-30"), "Codi - Grup": t("AF-12"), ...o });
    const c1 = course("Plegat i engomat", { Agremiats: rel(co.id), "Situació": status("Bonificat") });
    const c2 = course("Hot stamping", { "Situació": status("Acabat"), Hores: num(null), "Data final": date(null) });
    await run({ companies: ["c"], training: ["t"] }, { c: rows(co), t: rows(c1, c2) });
    const all = await db.select().from(trainingCourses);
    const plegat = all.find((x) => x.name === "Plegat i engomat")!;
    expect(plegat).toMatchObject({ status: "done", hours: 40, endsOn: "2026-06-30" });
    expect(plegat.companyId).toBeTruthy();
    expect(plegat.notes).toContain("Codi - Grup: AF-12"); expect(plegat.notes).toContain("Preu: 1.250,50 €"); expect(plegat.notes).toContain("Formadors (Notion): 2"); expect(plegat.notes).toContain("pressupost.pdf");
    expect(all.find((x) => x.name === "Hot stamping")).toMatchObject({ status: "done", hours: null, endsOn: null, companyId: null });
    // a later run on its own still finds the company through its stored Notion page id
    await db.delete(trainingCourses);
    await run({ training: ["t"] }, { t: rows(c1) });
    expect((await db.select().from(trainingCourses))[0].companyId).toBeTruthy();
  });
});

describe("the other rosters, people, suppliers and courses", () => {
  const rich = (s: string) => t(s);
  it("recognises each roster's layout: title as person, title as company, company-only rows, relation to a company; keeps extras in the notes", async () => {
    const co = company({ name: "Gràfiques Vila, S.L.", cif: "B1" });
    // Congrés: title "Nom i cognoms" is the person; company typed; interests as multi-selects
    const congres = rows(page({ "Nom i cognoms": title("Anna Puig"), Empresa: rich("Grafiques Vila SL"), "Correu electronic": email("anna@vila.example"), "Telèfon": phone("600111222"), "Innovació tecnològica:": multi("IA", "Robots") }));
    // FESPA: title EMPRESA is the company, separate person column; Tour as multi-select
    const fespa = rows(page({ EMPRESA: title("Grafiques Vila"), "Nom i cognoms": rich("Joan Soler"), CONTACTE: email("joan@vila.example"), "Tour / Fòrum": multi("Tour") }));
    // LabelExpo / Printing Our Future: companies only (one with a contact e-mail)
    const only = rows(page({ Empresa: title("Grafiques Vila"), "Ubicació": rich("Girona") }), page({ "Empresa Agremiada": title("Empresa Desconeguda SL"), email: email("info@x.example") }));
    // Alumnes màster: title is the student, company through a relation to an imported company
    const master = rows(page({ "Nom i cognoms": title("Marta Roca"), "Correo electrónico": email("marta@x.example"), Agremiats: rel(co.id) }));
    const r = await run({ companies: ["c"], rosters: ["a:Congrés", "b:FESPA", "o:LabelExpo", "m:Màster"] }, { c: rows(co), a: congres, b: fespa, o: only, m: master });
    expect((await db.select().from(events)).map((x) => x.name).sort()).toEqual(["Congrés", "FESPA", "LabelExpo", "Màster"]);
    expect((await db.select().from(people)).map((x) => x.name).sort()).toEqual(["Anna Puig", "Joan Soler", "Marta Roca"]);
    const at = await db.select().from(eventAttendance);
    expect(at).toHaveLength(5);
    expect(at.filter((x) => x.personId === null)).toHaveLength(2); // the two company-only rows
    expect(at.filter((x) => x.companyId)).toHaveLength(4); // Congrés, FESPA, the company-only Vila row and Màster (by relation); the unknown company stays unlinked
    expect(at.find((x) => x.notes.includes("Innovació tecnològica:: IA, Robots") || x.notes.includes("Innovació tecnològica:"))).toBeTruthy();
    expect(at.find((x) => x.notes.includes("Empresa: Empresa Desconeguda SL"))!.notes).toContain("Contacte: info@x.example");
    expect(r.reports.filter((x) => x.source.startsWith("Llista")).length).toBe(4);
  });
  it("people lists: no duplicates of people already imported (only blanks filled), trainers get a role, DNI never imported", async () => {
    const co = company({ name: "Vila SL", cif: "B1" });
    await run({ companies: ["c"], rosters: ["a:Sessió"] }, { c: rows(co), a: rows(page({ "Nom i cognoms": title("Anna Puig"), Empresa: rich("Vila SL"), "Correu electronic": email("anna@vila.example") })) });
    const personal = rows(page({ Nombre: title("Anna Puig"), Company: rich("Vila SL"), "Email addresses": email("anna@vila.example"), "Càrrec": rich("Gerent"), "Phone numbers": rich("933111222") }), page({ Nombre: title("Pere Nou"), Company: rich("Empresa Sense Fitxa"), "Email addresses": email("pere@x.example") }));
    const formadors = rows(page({ "Nom i cognoms": title("Laia Formadora"), "Correu electrònic": email("laia@x.example"), DNI: rich("12345678Z"), "perfil del formador": multi("Offset"), "Num. Telèfon": phone("600000000") }));
    const r = await run({ people: ["p:Personal", "f:Formadors:Formador"] }, { p: personal, f: formadors });
    const all = await db.select().from(people);
    expect(all).toHaveLength(3);
    const anna = all.find((x) => x.name === "Anna Puig")!;
    expect([anna.role, anna.phone]).toEqual(["Gerent", "933111222"]); // blanks filled
    expect(all.find((x) => x.name === "Pere Nou")!.notes).toContain("Empresa: Empresa Sense Fitxa");
    const laia = all.find((x) => x.name === "Laia Formadora")!;
    expect([laia.role, laia.source]).toEqual(["Formador", "Notion · Formadors"]);
    expect(JSON.stringify(all)).not.toContain("12345678Z");
    expect(r.reports.find((x) => x.source.includes("Formadors"))!.extra["DNI values left out on purpose"]).toBe(1);
    await run({ people: ["p:Personal", "f:Formadors:Formador"] }, { p: personal, f: formadors });
    expect(await db.select().from(people)).toHaveLength(3); // repeatable
  });
  it("a roster whose title is only a row number and whose person and company are LINKS to other databases resolves them", async () => {
    const co = company({ name: "Gràfiques Vila, S.L.", cif: "B1" });
    const personPage = page({ Nombre: title("Anna Puig"), Company: t("Vila"), "Email addresses": email("anna@vila.example") });
    const rosterRow = page({ "Empresa Agremiada": title("57"), Persona: rel(personPage.id), Empresa: rel(co.id), email: { type: "rollup", rollup: {} } });
    const orphan = page({ "Empresa Agremiada": title("56"), Persona: rel("99999999-9999-4999-8999-999999999999"), Empresa: rel("88888888-8888-4888-8888-888888888888") });
    const r = await run({ companies: ["c"], people: ["p:Personal"], rosters: ["r:Printing Our Future"] }, { c: rows(co), p: rows(personPage), r: rows(rosterRow, orphan) });
    const [ev] = await db.select().from(events);
    expect(ev.name).toBe("Printing Our Future");
    const at = await db.select().from(eventAttendance);
    expect(at).toHaveLength(1); // the orphan row points at nothing we imported: skipped and counted
    expect(at[0].personId).toBeTruthy(); expect(at[0].companyId).toBeTruthy();
    expect((await db.select().from(people)).map((x) => x.name)).toEqual(["Anna Puig"]); // no person made out of a page id or a row number
    expect(r.reports.find((x) => x.source.startsWith("Llista"))!.skipped).toBe(1);
  });
  it("suppliers and simple course lists", async () => {
    const sup = rows(page({ EMPRESA: title("Tintes Ràpides SA"), MAIL: email("ventes@tintes.example"), "UBICACIÓ": rich("Terrassa"), WEB: { type: "url", url: "https://tintes.example" }, ORIGEN: multi("FESPA"), NOTA: rich("Bon preu"), "contactar P26": { type: "checkbox", checkbox: true } }));
    const course = rows(page({ Nombre: title("Màster impressió"), Fecha: date("2026-03-15"), "accio i grup": rich("AF-7") }));
    const r = await run({ suppliers: ["s"], courses: ["k:Màster"] }, { s: sup, k: course });
    const [s] = await db.select().from(suppliers);
    expect(s).toMatchObject({ name: "Tintes Ràpides SA", email: "ventes@tintes.example" });
    expect(s.notes).toContain("UBICACIÓ: Terrassa"); expect(s.notes).toContain("contactar P26: sí"); expect(s.notes).toContain("ORIGEN: FESPA");
    const [c] = await db.select().from(trainingCourses);
    expect(c).toMatchObject({ name: "Màster impressió", startsOn: "2026-03-15" }); expect(c.notes).toContain("accio i grup: AF-7");
    expect(r.reports.map((x) => x.created)).toEqual([1, 1]);
    await run({ suppliers: ["s"], courses: ["k:Màster"] }, { s: sup, k: course });
    expect([(await db.select().from(suppliers)).length, (await db.select().from(trainingCourses)).length]).toEqual([1, 1]);
  });
});
