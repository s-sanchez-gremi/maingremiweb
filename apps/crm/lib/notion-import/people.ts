// Address books and trainer lists -> People. A person who is already there (same name and e-mail, or same name and company) is not
// duplicated: only their blank fields are filled. National ID numbers (DNI) are never imported.
import { and, eq, sql } from "drizzle-orm";
import { people } from "@apex/db/schema";
import type { Ctx } from "./companies";
import { companyMatcher } from "./events";
import { bump, newReport } from "./report";
import { first, mask, noteLines, str, type Row } from "./notion";

const EMAIL = ["Email addresses", "Correu electrònic", "Correu", "email", "Email"];
const PHONE = ["Phone numbers", "Número de telèfon", "Num. Telèfon", "Telèfon", "telefon"];
const COMPANY = ["Company", "Empresa"];
const NEVER = ["DNI"];
const text = (v: unknown) => (typeof v === "number" ? String(v) : str(v as string));

/** `spec`: label shown as the source of each person; `role`: default role when the row has none (e.g. "Formador"). */
export async function importPeople(ctx: Ctx, rows: Row[], idmap: Map<string, string>, spec: { id: string; label: string; role?: string }) {
  const { db } = ctx;
  const report = newReport(`Persones: ${spec.label}`);
  report.read = rows.length;
  const findCompany = await companyMatcher(ctx, idmap);
  for (const r of rows) {
    const p = r.props;
    if (!r.title || r.trashed) { report.skipped++; bump(report, "skipped: row has no name"); continue; }
    if (NEVER.some((k) => str(p[k]))) bump(report, "DNI values left out on purpose");
    const email = first(...EMAIL.map((k) => p[k])).toLowerCase();
    const emailOk = email.includes("@") ? email : "";
    const phone = first(...PHONE.map((k) => text(p[k])));
    const role = str(p["Càrrec"]) || spec.role || "";
    const companyText = first(...COMPANY.map((k) => p[k]));
    const companyId = companyText ? findCompany(null, companyText) : null;
    const notes = [!companyId && companyText ? `Empresa: ${companyText}` : "", noteLines(r, [...EMAIL, ...PHONE, ...COMPANY, ...NEVER, "Càrrec"])].filter(Boolean).join("\n");
    const existing = (await db.select().from(people).where(and(sql`lower(${people.name}) = ${r.title.toLowerCase()}`, emailOk ? eq(people.email, emailOk) : companyId ? eq(people.companyId, companyId) : sql`true`)).limit(1))[0];
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.phone && phone) patch.phone = phone;
      if (!existing.role && role) patch.role = role;
      if (!existing.companyId && companyId) patch.companyId = companyId;
      if (!existing.email && emailOk) patch.email = emailOk;
      if (Object.keys(patch).length) { await db.update(people).set(patch).where(eq(people.id, existing.id)); report.updated++; } else report.skipped++;
      continue;
    }
    const done = await db.insert(people).values({ name: r.title, email: emailOk, phone, role, companyId, source: `Notion · ${spec.label}`, notes, externalRef: r.id }).onConflictDoNothing().returning({ id: people.id });
    if (done.length) { report.created++; if (report.samples.length < 5) report.samples.push(mask(r.title)); } else { report.skipped++; bump(report, "skipped: already imported from this page"); }
  }
  return report;
}
