// Notion mailing lists (Newsletters, Llistat Escola) -> the "Llistes de correu" registry. One row per address per list.
// Consent is not known from Notion, so it stays empty and the notes say so. Nothing is ever sent from Apex.
import { and, eq, sql } from "drizzle-orm";
import { mailingContacts } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { bump, newReport } from "./report";
import { mask, str, type Row } from "./notion";

const NAME = ["Nom", "Persona", "Persona > Name"];
const EMAIL = ["email", "Persona > Email addresses", "Correu"];
const ORIGIN = ["Origen", "campaign"];
const first = (p: Row["props"], keys: string[]) => keys.map((k) => str(p[k] as string)).find(Boolean) ?? "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `spec`: label shown in the report; `list`: which list these rows belong to. */
export async function importMailing(ctx: Ctx, rows: Row[], spec: { label: string; list: "newsletter" | "school" }) {
  const report = newReport(`Llista de correu: ${spec.label}`);
  report.read = rows.length;
  for (const r of rows) {
    if (r.trashed) { report.skipped++; continue; }
    const email = (first(r.props, EMAIL) || (EMAIL_RE.test(r.title) ? r.title : "")).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { report.skipped++; bump(report, "skipped: no valid e-mail"); continue; }
    const tags = Array.isArray(r.props["Clasificacio"]) ? (r.props["Clasificacio"] as string[]) : [];
    const name = first(r.props, NAME) || (r.title.includes("@") ? "" : r.title);
    const values = { list: spec.list, email, name, origin: first(r.props, ORIGIN), tags, notes: "Importat de Notion; consentiment pendent de verificar.", externalRef: r.id };
    const [dup] = await ctx.db.select({ id: mailingContacts.id, ref: mailingContacts.externalRef }).from(mailingContacts).where(and(eq(mailingContacts.list, spec.list), sql`lower(${mailingContacts.email}) = ${email}`));
    if (dup) {
      if (dup.ref !== r.id) bump(report, "duplicate address in this list (kept once)");
      if (ctx.overwrite) { await ctx.db.update(mailingContacts).set(values).where(eq(mailingContacts.id, dup.id)); report.updated++; } else report.skipped++;
      continue;
    }
    await ctx.db.insert(mailingContacts).values(values);
    report.created++;
    if (report.samples.length < 5) report.samples.push(mask(email));
  }
  return report;
}
