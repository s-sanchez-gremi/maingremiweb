// Notion "GALA GRÀFICA" (attendee list) -> one event + people + attendance, and "Visites agremiats" -> visits.
// National ID numbers (DNI) in the gala list are deliberately NOT imported: nothing in the CRM needs them.
import { and, eq, sql } from "drizzle-orm";
import { clients, eventAttendance, events, people, visits } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { bump, newReport } from "./report";
import { first, isoDate, mask, normName, str, type Row } from "./notion";

/** company id from a relation (Notion page ids already imported) or, failing that, from the company name typed as text. */
async function companyFor(ctx: Ctx, idmap: Map<string, string>, relation: unknown, text: string) {
  const viaRelation = Array.isArray(relation) ? (relation as string[]).map((r) => idmap.get(r)).find(Boolean) : undefined;
  if (viaRelation) return viaRelation;
  if (!text) return null;
  const all = await ctx.db.select({ id: clients.id, name: clients.name }).from(clients).where(sql`lower(${clients.name}) = ${text.toLowerCase()}`).limit(1);
  if (all[0]) return all[0].id;
  const n = normName(text);
  const rows = await ctx.db.select({ id: clients.id, name: clients.name }).from(clients);
  return rows.find((r) => normName(r.name) === n)?.id ?? null;
}

export async function importGala(ctx: Ctx, rows: Row[], idmap: Map<string, string>, eventName = "GALA GRÀFICA 2025", eventRef = "notion:gala") {
  const { db } = ctx;
  const report = newReport(`Gala (${eventName})`);
  report.read = rows.length;
  let [ev] = await db.select().from(events).where(eq(events.externalRef, eventRef));
  if (!ev) { [ev] = await db.insert(events).values({ name: eventName, kind: "gala", status: "done", externalRef: eventRef }).returning(); bump(report, "event created"); }
  for (const r of rows) {
    const p = r.props;
    const name = first(p["Nom"], p["Persona"]);
    if (!name || r.trashed) { report.skipped++; continue; }
    if (str(p["DNI"])) bump(report, "DNI values left out on purpose");
    const email = str(p["Email"]).toLowerCase();
    const companyId = await companyFor(ctx, idmap, p["📜 Empreses"], str(p["Empresa"]));
    if (!companyId && str(p["Empresa"])) bump(report, "attendees whose company was not found");
    let person = (await db.select({ id: people.id }).from(people).where(email ? eq(people.email, email) : and(sql`lower(${people.name}) = ${name.toLowerCase()}`, companyId ? eq(people.companyId, companyId) : sql`true`)).limit(1))[0];
    if (!person) {
      person = (await db.insert(people).values({ name, email, companyId, source: "Notion · Gala 2025", externalRef: r.id }).onConflictDoNothing().returning({ id: people.id }))[0]
        ?? (await db.select({ id: people.id }).from(people).where(eq(people.externalRef, r.id)))[0];
      bump(report, "people created");
    }
    const notes = [str(p["Categoria"]) && `Categoria: ${str(p["Categoria"])}`, str(p["SEIENTS"]) && `Seients: ${str(p["SEIENTS"])}`, str(p["Fila"]) && `Fila: ${str(p["Fila"])}`, str(p["Observacions"]) && str(p["Observacions"])].filter(Boolean).join(" · ");
    const done = await db.insert(eventAttendance).values({ eventId: ev.id, personId: person.id, companyId, status: "confirmed", notes, externalRef: r.id }).onConflictDoNothing().returning({ id: eventAttendance.id });
    if (done.length) { report.created++; if (report.samples.length < 5) report.samples.push(`${mask(name)} → ${eventName}`); } else report.skipped++;
  }
  return report;
}

const VISIT_STATUS: Record<string, string> = { completada: "done", programada: "planned", "sin empezar": "planned" };
const VISIT_KIND: Record<string, string> = { agremiar: "new_member", visita: "follow_up", patrocini: "commercial" };

export async function importVisits(ctx: Ctx, rows: Row[], idmap: Map<string, string>) {
  const { db } = ctx;
  const report = newReport("Visites agremiats");
  report.read = rows.length;
  for (const r of rows) {
    const p = r.props;
    const subject = first(p["Nombre de la tarea"], p["Nom"]);
    if (!subject || r.trashed) { report.skipped++; continue; }
    const types = Array.isArray(p["Tipo de tarea"]) ? (p["Tipo de tarea"] as string[]) : [];
    const companyId = (Array.isArray(p["Empresa"]) ? (p["Empresa"] as string[]).map((x) => idmap.get(x)).find(Boolean) : undefined) ?? null;
    if (!companyId && Array.isArray(p["Empresa"]) && (p["Empresa"] as string[]).length) bump(report, "visits whose company was not found");
    const summary = [str(p["Descripción"]), types.length > 1 && `Tipus: ${types.join(", ")}`, str(p["Prioridad"]) && `Prioritat: ${str(p["Prioridad"])}`, str(p["Responsable"]) && `Responsable (Notion): ${str(p["Responsable"])}`].filter(Boolean).join("\n");
    const vals = { subject, companyId, visitedOn: isoDate(str(p["Data"])), kind: VISIT_KIND[(types[0] ?? "").toLowerCase()] ?? "other", status: VISIT_STATUS[str(p["Estado"]).toLowerCase()] ?? "planned", summary, externalRef: r.id };
    const [exists] = await db.select({ id: visits.id }).from(visits).where(eq(visits.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await db.update(visits).set(vals).where(eq(visits.id, exists.id)); report.updated++; } else report.skipped++; continue; }
    await db.insert(visits).values(vals);
    report.created++;
    if (report.samples.length < 5) report.samples.push(`${mask(subject)} · ${vals.status}`);
  }
  return report;
}
