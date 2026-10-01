// Contact rosters (the "Laboral" lists: company, contact person, e-mail, phone, one list per dated session) -> one EVENT per list,
// the contacts as People and one attendance row each (status "Convidat": Notion does not say who came).
import { and, eq, sql } from "drizzle-orm";
import { eventAttendance, events, people } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { companyMatcher } from "./events";
import { bump, newReport } from "./report";
import { first, mask, str, type Row } from "./notion";

const phoneText = (v: unknown) => (typeof v === "number" ? String(v) : str(v as string));

/** `list`: id of the Notion database, `eventName`: the event the list becomes (e.g. "Laboral 04/03"). */
export async function importContactList(ctx: Ctx, rows: Row[], idmap: Map<string, string>, list: { id: string; eventName: string }) {
  const { db } = ctx;
  const report = newReport(`Llista: ${list.eventName}`);
  report.read = rows.length;
  const findCompany = await companyMatcher(ctx, idmap);
  const ref = `notion:${list.id}`;
  let [ev] = await db.select().from(events).where(eq(events.externalRef, ref));
  if (!ev) { [ev] = await db.insert(events).values({ name: list.eventName, kind: "other", status: "done", externalRef: ref }).returning(); bump(report, "event created"); }
  for (const r of rows) {
    const p = r.props;
    const company = first(p["Empresa"], r.title);
    const name = first(p["Nom i cognom contacte"], p["Persona"], p["Nom"], p["Persona > Nom"]);
    if (r.trashed || (!name && !company)) { report.skipped++; bump(report, "skipped: row has neither a person nor a company"); continue; }
    const email = first(p["email"], p["Email"], p["Persona > Email addresses"]).toLowerCase();
    const phone = phoneText(p["telefon"] ?? p["Telèfon"] ?? p["Persona > Phone numbers"]);
    const companyId = company ? findCompany(null, company) : null;
    if (company && !companyId) bump(report, "rows whose company was not found (name kept in the attendance notes)");
    const personName = name || company; // a row with only a company becomes a person named after it, so nothing is lost
    let person = (await db.select({ id: people.id }).from(people).where(and(sql`lower(${people.name}) = ${personName.toLowerCase()}`, email ? eq(people.email, email) : companyId ? eq(people.companyId, companyId) : sql`true`)).limit(1))[0];
    if (!person) {
      person = (await db.insert(people).values({ name: personName, email, phone, companyId, source: `Notion · ${list.eventName}`, externalRef: r.id }).onConflictDoNothing().returning({ id: people.id }))[0]
        ?? (await db.select({ id: people.id }).from(people).where(eq(people.externalRef, r.id)))[0];
      bump(report, "people created");
    }
    const notes = !companyId && company ? `Empresa: ${company}` : "";
    const done = await db.insert(eventAttendance).values({ eventId: ev.id, personId: person.id, companyId, status: "invited", notes, externalRef: r.id }).onConflictDoNothing().returning({ id: eventAttendance.id });
    if (done.length) { report.created++; if (report.samples.length < 5) report.samples.push(`${mask(personName)} → ${list.eventName}`); } else { report.skipped++; bump(report, "skipped: same person already listed for this event"); }
  }
  return report;
}
