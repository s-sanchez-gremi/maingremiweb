import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@apex/db";
import { clients, eventAttendance, events, feeTiers, jobSeekers, members, people, visits, users } from "@apex/db/schema";
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
  for (const x of [eventAttendance, events, visits, jobSeekers, people, members, feeTiers, clients, users]) await db.delete(x);
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
    const { reports } = await run({ companies: ["db"] }, { db: rows(parent, child, old, prospect) });
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
