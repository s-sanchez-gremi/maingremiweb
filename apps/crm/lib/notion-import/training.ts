// Notion "Bonificada" (funded training courses) -> Formació bonificada. Status: En curs -> running, Bonificat/Acabat -> done.
// Company: the first member or external company linked; the rest, the trainers (not imported), price, code and budget file names stay in the notes.
import { eq } from "drizzle-orm";
import { clients, trainingCourses } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { bump, newReport } from "./report";
import { isoDate, mask, noteLines, num, str, type Row } from "./notion";

const STATUS: Record<string, string> = { "en curs": "running", bonificat: "done", acabat: "done" };
const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const euros = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export async function importTraining(ctx: Ctx, rows: Row[], idmap: Map<string, string>) {
  const { db } = ctx;
  const report = newReport("Formació bonificada");
  report.read = rows.length;
  // company page ids from a previous run are found through the external_ref the company import stored
  const resolve = async (pid: string) => idmap.get(pid) ?? (await db.select({ id: clients.id }).from(clients).where(eq(clients.externalRef, pid)).limit(1))[0]?.id;
  for (const r of rows) {
    const p = r.props;
    if (!r.title || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    const linked: string[] = [];
    for (const pid of [...ids(p["Agremiats"]), ...ids(p["Externes"])]) { const c = await resolve(pid); if (c && !linked.includes(c)) linked.push(c); }
    const wanted = ids(p["Agremiats"]).length + ids(p["Externes"]).length;
    if (wanted && !linked.length) bump(report, "courses whose company was not found");
    if (linked.length > 1) bump(report, "courses with several companies (first one linked, the rest not)");
    const price = num(p["Preu"]);
    const notes = [
      str(p["Codi - Grup"]) && `Codi - Grup: ${str(p["Codi - Grup"])}`, price !== null && `Preu: ${euros(price)} €`,
      ids(p["Formadors"]).length > 0 && `Formadors (Notion): ${ids(p["Formadors"]).length}`, str(p["Pressupost"]) && `Pressupost (fitxer a Notion): ${str(p["Pressupost"])}`,
      str(p["Responsable"]) && `Responsable (Notion): ${str(p["Responsable"])}`,
    ].filter(Boolean).join("\n");
    const hours = num(p["Hores"]);
    const vals = { name: r.title, status: STATUS[str(p["Situació"]).toLowerCase()] ?? "planned", endsOn: isoDate(str(p["Data final"])), hours: hours !== null && hours >= 0 ? Math.round(hours) : null, companyId: linked[0] ?? null, notes, externalRef: r.id };
    const [exists] = await db.select({ id: trainingCourses.id }).from(trainingCourses).where(eq(trainingCourses.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await db.update(trainingCourses).set(vals).where(eq(trainingCourses.id, exists.id)); report.updated++; } else report.skipped++; continue; }
    await db.insert(trainingCourses).values(vals);
    report.created++;
    if (report.samples.length < 5) report.samples.push(`${mask(r.title)} · ${vals.status}`);
  }
  return report;
}

/** Course follow-up lists with no fixed structure (e.g. "Formació màster seguiment"): title = name, "Fecha" = start, the rest as notes. */
export async function importCourses(ctx: Ctx, rows: Row[], label = "Cursos") {
  const { db } = ctx;
  const report = newReport(label);
  report.read = rows.length;
  for (const r of rows) {
    if (!r.title || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    const vals = { name: r.title, status: "planned", startsOn: isoDate(str(r.props["Fecha"])), notes: noteLines(r), externalRef: r.id };
    const [exists] = await db.select({ id: trainingCourses.id }).from(trainingCourses).where(eq(trainingCourses.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await db.update(trainingCourses).set(vals).where(eq(trainingCourses.id, exists.id)); report.updated++; } else report.skipped++; continue; }
    await db.insert(trainingCourses).values(vals);
    report.created++;
    if (report.samples.length < 5) report.samples.push(mask(r.title));
  }
  return report;
}
