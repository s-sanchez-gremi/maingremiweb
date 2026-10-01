// Areas whose Notion pages have no fixed structure we know of (labour cases, funded training, job seekers, sponsors):
// the page title becomes the record's name and every other filled property is kept as readable text lines in its notes,
// so nothing is lost and a person can tidy the record afterwards. Re-running never duplicates (external_ref).
import { eq } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { jobSeekers, labourCases, sponsors, trainingCourses } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { newReport } from "./report";
import { isoDate, mask, str, type Row } from "./notion";

type Target = { label: string; table: AnyPgTable; name: string; notes: string; defaults?: (r: Row) => Record<string, unknown> };
const lines = (r: Row, skip: string[]) => Object.entries(r.props).filter(([k, v]) => !skip.includes(k) && v !== null && v !== "" && v !== false && !(Array.isArray(v) && (v.length === 0 || /^[0-9a-f-]{36}$/.test(v[0])))).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
const emailOf = (r: Row) => Object.entries(r.props).find(([k, v]) => /mail|correu/i.test(k) && /@/.test(str(v)))?.[1];
const phoneOf = (r: Row) => Object.entries(r.props).find(([k, v]) => /tel|phone|mòbil|movil/i.test(k) && str(v))?.[1];

export const TARGETS: Record<string, Target> = {
  labour: { label: "Laboral", table: labourCases, name: "title", notes: "summary" },
  training: { label: "Formació bonificada", table: trainingCourses, name: "name", notes: "notes" },
  sponsors: { label: "Patrocinadors", table: sponsors, name: "name", notes: "notes" },
  jobseekers: {
    label: "Borsa de treball", table: jobSeekers, name: "name", notes: "notes",
    // consent and retention are NOT known from Notion: they stay empty on purpose, and the note says so
    defaults: (r) => ({ email: str(emailOf(r)), phone: str(phoneOf(r)), registeredOn: isoDate(r.createdTime), notes: `Importat de Notion; consentiment i termini de conservació pendents de verificar.\n${lines(r, [r.titleKey])}`.trim() }),
  },
};

export async function importGeneric(ctx: Ctx, key: keyof typeof TARGETS, rows: Row[]) {
  const t = TARGETS[key];
  const report = newReport(t.label);
  report.read = rows.length;
  const tbl = t.table as unknown as Record<string, never>;
  for (const r of rows) {
    const title = r.title;
    if (!title || r.trashed) { report.skipped++; continue; }
    const base: Record<string, unknown> = { [t.name]: title, [t.notes]: lines(r, [r.titleKey]), externalRef: r.id, ...(t.defaults?.(r) ?? {}) };
    const [exists] = await ctx.db.select({ id: tbl.id }).from(t.table).where(eq(tbl.externalRef, r.id));
    if (exists) { if (ctx.overwrite) { await ctx.db.update(t.table).set(base).where(eq(tbl.id, (exists as { id: string }).id)); report.updated++; } else report.skipped++; continue; }
    await ctx.db.insert(t.table).values(base as never);
    report.created++;
    if (report.samples.length < 5) report.samples.push(mask(title));
  }
  return report;
}
