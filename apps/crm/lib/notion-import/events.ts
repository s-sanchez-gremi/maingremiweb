// Notion "GALA GRÀFICA" (attendee list) -> one event + people + attendance, and "Visites agremiats" -> visits.
// National ID numbers (DNI) in the gala list are deliberately NOT imported: nothing in the CRM needs them.
import { and, eq, sql } from "drizzle-orm";
import { clients, eventAttendance, events, people, visits } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { bump, newReport } from "./report";
import { canon, first, isoDate, mask, str, type Row } from "./notion";

/** Finds companies by relation (Notion page ids already imported) or by the name typed as text: exact first, then a unique containment match. */
export async function companyMatcher(ctx: Ctx, idmap: Map<string, string>) {
  const all = await ctx.db.select({ id: clients.id, name: clients.name, ref: clients.externalRef }).from(clients);
  const byRef = new Map(all.filter((c) => c.ref).map((c) => [c.ref as string, c.id]));
  const byCanon = new Map<string, string[]>();
  for (const c of all) { const k = canon(c.name); if (k) byCanon.set(k, [...(byCanon.get(k) ?? []), c.id]); }
  const keys = [...byCanon.keys()];
  return (relation: unknown, text: string): string | null => {
    const viaRelation = Array.isArray(relation) ? (relation as string[]).map((r) => idmap.get(r) ?? byRef.get(r)).find(Boolean) : undefined;
    if (viaRelation) return viaRelation;
    const k = canon(text);
    if (k.length < 3) return null;
    const exact = byCanon.get(k);
    if (exact?.length === 1) return exact[0];
    if (exact) return null; // several companies share the name: do not guess
    if (k.length < 5) return null;
    const near = keys.filter((x) => x.length >= 5 && (x.includes(k) || k.includes(x)));
    return near.length === 1 && byCanon.get(near[0])!.length === 1 ? byCanon.get(near[0])![0] : null;
  };
}

export async function importGala(ctx: Ctx, rows: Row[], idmap: Map<string, string>, eventName = "GALA GRÀFICA 2025", eventRef = "notion:gala") {
  const { db } = ctx;
  const report = newReport(`Gala (${eventName})`);
  report.read = rows.length;
  const findCompany = await companyMatcher(ctx, idmap);
  let [ev] = await db.select().from(events).where(eq(events.externalRef, eventRef));
  if (!ev) { [ev] = await db.insert(events).values({ name: eventName, kind: "gala", status: "done", externalRef: eventRef }).returning(); bump(report, "event created"); }
  for (const r of rows) {
    const p = r.props;
    const name = first(p["Nom"], p["Persona"]);
    if (!name || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    if (str(p["DNI"])) bump(report, "DNI values left out on purpose");
    const email = str(p["Email"]).toLowerCase();
    const companyId = findCompany(p["📜 Empreses"], str(p["Empresa"]));
    if (!companyId && str(p["Empresa"])) bump(report, "attendees whose company was not found");
    let person = (await db.select({ id: people.id }).from(people).where(and(sql`lower(${people.name}) = ${name.toLowerCase()}`, email ? eq(people.email, email) : companyId ? eq(people.companyId, companyId) : sql`true`)).limit(1))[0];
    if (!person) {
      person = (await db.insert(people).values({ name, email, companyId, source: "Notion · Gala 2025", externalRef: r.id }).onConflictDoNothing().returning({ id: people.id }))[0]
        ?? (await db.select({ id: people.id }).from(people).where(eq(people.externalRef, r.id)))[0];
      bump(report, "people created");
    }
    const notes = [str(p["Categoria"]) && `Categoria: ${str(p["Categoria"])}`, str(p["SEIENTS"]) && `Seients: ${str(p["SEIENTS"])}`, str(p["Fila"]) && `Fila: ${str(p["Fila"])}`, str(p["Observacions"]) && str(p["Observacions"])].filter(Boolean).join(" · ");
    // seat type and category are tags now (Notion multi-selects); the free text stays in the notes as before
    const SEAT: Record<string, string> = { platea: "platea", llotja: "llotja", "llotja sponsor": "llotja_sponsor", vip: "vip", nominal: "nominal" };
    const tagList = (v: unknown) => (Array.isArray(v) ? (v as string[]).map((t) => t.trim()) : []).filter(Boolean);
    const seats = [...new Set(tagList(p["SEIENTS"]).map((t) => SEAT[t.toLowerCase()]).filter(Boolean))];
    const categories = [...new Set(tagList(p["Categoria"]).map((t) => t.toLowerCase()))];
    const done = await db.insert(eventAttendance).values({ eventId: ev.id, personId: person.id, companyId, status: "confirmed", seats, categories, notes, externalRef: r.id }).onConflictDoNothing().returning({ id: eventAttendance.id });
    if (!done.length && (seats.length || categories.length)) { // an earlier import had these only in the notes: fill the tags once
      const upd = await db.update(eventAttendance).set({ seats, categories }).where(and(eq(eventAttendance.externalRef, r.id), sql`cardinality(${eventAttendance.seats}) = 0 and cardinality(${eventAttendance.categories}) = 0`)).returning({ id: eventAttendance.id });
      if (upd.length) bump(report, "seat and category tags filled on rows imported before");
    }
    if (done.length) { report.created++; if (report.samples.length < 5) report.samples.push(`${mask(name)} → ${eventName}`); } else { report.skipped++; bump(report, "skipped: same person already listed for this event"); }
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
