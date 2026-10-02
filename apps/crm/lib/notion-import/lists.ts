// Rosters of an event or session (who is invited / came / signed up): one Notion database per event -> one EVENT, its contacts as
// People and one attendance row each (status "Convidat": Notion does not say who came). The databases are built differently
// (the title is sometimes the company, sometimes the person; e-mail and phone have many names), so the columns are recognised by role:
//   title named "Empresa…"  -> company;   a separate person column ("Persona", "Nom i cognoms", "Nom i cognom contacte") -> person;
//   no person column and the title is "Nom i cognoms" or the row has a company column -> the title is the person.
// A row with a company but no person becomes an attendance row of the company alone. Everything else on the row goes to the notes.
import { and, eq, sql } from "drizzle-orm";
import { eventAttendance, events, people } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { companyMatcher } from "./events";
import { bump, newReport } from "./report";
import { mask, noteLines, str, type Row } from "./notion";

const EMAIL = ["email", "Email", "Correu electronic", "Correu electrònic", "Correo electrónico", "CONTACTE", "Persona > Email addresses", "MAIL"];
const PHONE = ["telefon", "Telèfon", "Teléfono", "Phone", "Persona > Phone numbers", "Telèfon de contacte", "mòbil"];
const PERSON = ["Nom i cognom contacte", "Persona", "Nom i cognoms", "Nom"];
const COMPANY = ["Empresa", "EMPRESA", "empresa"];
const RELATION = ["Agremiats", "📜 Empreses"];
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && /^[0-9a-f-]{36}$/.test(String(v[0]));
/** text of a property; a relation (a list of Notion page ids) is NOT text */
const text = (v: unknown) => (typeof v === "number" ? String(v) : isIds(v) ? "" : str(v as string));
const ids = (v: unknown) => (isIds(v) ? v : []);

export function readRosterRow(r: Row) {
  const p = r.props, tk = r.titleKey;
  const title = /^\d+$/.test(r.title) ? "" : r.title; // a title that is only a row number says nothing
  const personKey = PERSON.find((k) => k !== tk && text(p[k]));
  const companyKey = COMPANY.find((k) => k !== tk && text(p[k]));
  const companyTitle = /^empresa/i.test(tk);
  let person = "", company = "";
  if (companyTitle) { company = title; person = personKey ? text(p[personKey]) : ""; }
  else if (personKey) { person = text(p[personKey]); company = companyKey ? text(p[companyKey]) : title; }
  else if (/^nom i cognoms$|^nom$/i.test(tk) || companyKey) { person = title; company = companyKey ? text(p[companyKey]) : ""; }
  else company = title;
  const emailKey = EMAIL.find((k) => text(p[k]).includes("@")), phoneKey = PHONE.find((k) => text(p[k]));
  // links to other Notion databases (a person page, a company page): resolved later against what was imported
  const companyIds = [...COMPANY, ...RELATION].flatMap((k) => ids(p[k]));
  const personIds = PERSON.flatMap((k) => ids(p[k]));
  const relKeys = [...COMPANY, ...RELATION, ...PERSON].filter((k) => isIds(p[k]));
  const used = [personKey, companyKey, emailKey, phoneKey, ...relKeys].filter((k): k is string => !!k);
  return { person, company, email: emailKey ? (text(p[emailKey]).split(",").map((e) => e.trim().toLowerCase()).find((e) => e.includes("@")) ?? "") : "", phone: phoneKey ? text(p[phoneKey]) : "", companyIds, personIds, used };
}

/** `list`: id of the Notion database, `eventName`: the event it becomes. */
export async function importRoster(ctx: Ctx, rows: Row[], idmap: Map<string, string>, list: { id: string; eventName: string }) {
  const { db } = ctx;
  const report = newReport(`Llista: ${list.eventName}`);
  report.read = rows.length;
  const findCompany = await companyMatcher(ctx, idmap);
  const personByRef = new Map((await db.select({ id: people.id, ref: people.externalRef }).from(people)).filter((x) => x.ref).map((x) => [x.ref as string, x.id]));
  const ref = `notion:${list.id}`;
  let [ev] = await db.select().from(events).where(eq(events.externalRef, ref));
  if (!ev) { [ev] = await db.insert(events).values({ name: list.eventName, kind: "other", status: "done", externalRef: ref }).returning(); bump(report, "event created"); }
  for (const r of rows) {
    const x = readRosterRow(r);
    // a person: linked page, else (a row with nothing but an e-mail) the one person already imported with that e-mail
    let linkedPerson = x.personIds.map((i) => personByRef.get(i)).find(Boolean) ?? null;
    if (!linkedPerson && !x.person && x.email) {
      const same = await db.select({ id: people.id }).from(people).where(eq(people.email, x.email)).limit(2);
      if (same.length === 1) { linkedPerson = same[0].id; bump(report, "rows matched to a known person by e-mail"); }
    }
    const companyId = x.company || x.companyIds.length ? findCompany(x.companyIds, x.company) : null;
    if (r.trashed || (!x.person && !x.company && !linkedPerson && !companyId && !x.email)) { report.skipped++; bump(report, "skipped: nothing identifies the row (no person, company or e-mail we know)"); continue; }
    if ((x.company || x.companyIds.length) && !companyId) bump(report, "rows whose company was not found (name kept in the attendance notes)");
    let personId: string | null = linkedPerson;
    if (!linkedPerson && x.person) {
      const existing = (await db.select({ id: people.id }).from(people).where(and(sql`lower(${people.name}) = ${x.person.toLowerCase()}`, x.email ? eq(people.email, x.email) : companyId ? eq(people.companyId, companyId) : sql`true`)).limit(1))[0];
      personId = existing?.id ?? (await db.insert(people).values({ name: x.person, email: x.email, phone: x.phone, companyId, source: `Notion · ${list.eventName}`, externalRef: r.id }).onConflictDoNothing().returning({ id: people.id }))[0]?.id
        ?? (await db.select({ id: people.id }).from(people).where(eq(people.externalRef, r.id)))[0]?.id ?? null;
      if (!existing) bump(report, "people created");
    }
    const notes = [!companyId && x.company ? `Empresa: ${x.company}` : "", !x.person && x.email ? `Contacte: ${x.email}` : "", noteLines(r, x.used)].filter(Boolean).join("\n");
    const done = await db.insert(eventAttendance).values({ eventId: ev.id, personId, companyId, status: "invited", notes, externalRef: r.id }).onConflictDoNothing().returning({ id: eventAttendance.id });
    if (done.length) { report.created++; if (report.samples.length < 5) report.samples.push(`${mask(x.person || x.company)} → ${list.eventName}`); } else { report.skipped++; bump(report, "skipped: same person already listed for this event"); }
  }
  return report;
}
export const importContactList = importRoster;
